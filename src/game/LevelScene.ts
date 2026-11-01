import * as Phaser from "phaser";
import type { Level, Point, Role } from "@/lib/level";
import { centroid } from "./geometry";
import { roleToBodyOptions, type BodyOptions } from "./roles";
import { PLAYER_JUMP, PLAYER_SPEED, playerSize } from "./physics";
import { releaseTouch, takeQueuedJump, touchInput } from "./touchInput";
import { resolveFrameInput } from "./frameInput";

export interface LevelSceneCallbacks {
  onWin: () => void;
}

interface MatterRectangle extends Phaser.GameObjects.Rectangle {
  setVelocity(x: number, y: number): this;
  setVelocityX(x: number): this;
  setVelocityY(y: number): this;
  setFixedRotation(): this;
}

interface MatterBodyModule {
  setPosition(body: unknown, position: { x: number; y: number }): void;
}

interface MatterSurface {
  restitution: number;
  friction: number;
  frictionStatic: number;
  parts?: MatterSurface[];
}

interface CollisionPair {
  bodyA: { label?: string };
  bodyB: { label?: string };
}

const ART_FILL = 0x94a3b8;
const ART_LINE = 0x1e293b;
const PLAYER_COLOR = 0xf8fafc;
const GOAL_COLOR = 0x22d3ee;

export class LevelScene extends Phaser.Scene {
  private level: Level;
  private callbacks: LevelSceneCallbacks;
  private player?: MatterRectangle;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyR?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private groundSolids = new Set<string>();
  private roleById = new Map<string, Role>();
  private won = false;
  private debugOn = false;
  private debugGfx?: Phaser.GameObjects.Graphics;
  private debugLabels: Phaser.GameObjects.Text[] = [];

  constructor(level: Level, callbacks: LevelSceneCallbacks) {
    super("level");
    this.level = level;
    this.callbacks = callbacks;
  }

  restartLevel(): void {
    releaseTouch();
    this.scene.restart();
  }

  preload(): void {
    this.load.image("bg", this.level.image);
  }

  create(): void {
    releaseTouch();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, releaseTouch);
    const { width, height } = this.level;
    this.groundSolids.clear();
    this.roleById = new Map(this.level.objects.map((o) => [o.id, o.role]));
    this.won = false;
    this.debugOn = false;

    this.add.image(0, 0, "bg").setOrigin(0).setDisplaySize(width, height);
    this.drawLevelArt();
    this.debugGfx = this.add.graphics().setDepth(10);

    for (const object of this.level.objects) {
      const options = roleToBodyOptions(object.role);
      if (!options.collides) {
        continue;
      }
      const kind = object.role === "hazard" ? "hazard" : "solid";
      for (const part of object.parts) {
        this.addStaticPart(part, `${kind}:${object.id}`, options);
      }
    }

    const floor = this.matter.add.rectangle(width / 2, height - 4, width, 8, {
      isStatic: true,
      label: "solid:floor",
    });
    this.applySurface(floor, roleToBodyOptions("platform"));
    this.matter.world.setBounds(0, 0, width, height, 64, true, true, true, false);

    const [gx, gy] = this.level.goal;
    const gr = Math.min(width, height) * 0.024;
    this.matter.add.circle(gx, gy, gr, {
      isStatic: true,
      isSensor: true,
      label: "goal",
    });
    const goalGfx = this.add.graphics();
    goalGfx.lineStyle(4, GOAL_COLOR);
    goalGfx.strokeCircle(gx, gy, gr);
    goalGfx.fillStyle(GOAL_COLOR, 0.9);
    goalGfx.fillCircle(gx, gy, gr * 0.35);

    const { pw, ph } = playerSize(width, height);
    const [sx, sy] = this.level.start;
    const player = this.add.rectangle(sx, sy, pw, ph, PLAYER_COLOR) as MatterRectangle;
    this.matter.add.gameObject(player, {
      label: "player",
      restitution: 0,
      friction: 0.1,
    });
    player.setFixedRotation();
    this.player = player;

    this.matter.world.on(
      "collisionstart",
      (event: { pairs: CollisionPair[] }) => {
        for (const pair of event.pairs) {
          this.handleCollision(pair.bodyA.label, pair.bodyB.label, true);
        }
      },
    );
    this.matter.world.on(
      "collisionend",
      (event: { pairs: CollisionPair[] }) => {
        for (const pair of event.pairs) {
          this.handleCollision(pair.bodyA.label, pair.bodyB.label, false);
        }
      },
    );

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    }
  }

  update(): void {
    const player = this.player;
    if (
      !player ||
      !this.cursors ||
      !this.keyW ||
      !this.keyA ||
      !this.keyR ||
      !this.keyD
    ) {
      return;
    }
    if (this.won) {
      player.setVelocity(0, 0);
      return;
    }
    const speed = this.level.width * PLAYER_SPEED;
    const frame = resolveFrameInput({
      moveLeft:
        this.cursors.left.isDown || this.keyA.isDown || touchInput.left,
      moveRight: this.cursors.right.isDown || touchInput.right,
      jump:
        takeQueuedJump() ||
        Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        Phaser.Input.Keyboard.JustDown(this.keyW),
      grounded: this.groundSolids.size > 0,
    });
    if (frame.vx !== 0) {
      player.setVelocityX(frame.vx * speed);
    } else if (!this.onSlippery()) {
      player.setVelocityX(0);
    }
    if (frame.jump) {
      player.setVelocityY(-this.level.height * PLAYER_JUMP);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.scene.restart();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyD)) {
      this.toggleDebug();
    }
    if (player.y > this.level.height + 60) {
      this.respawn();
    }
  }

  private addStaticPart(part: Point[], label: string, options: BodyOptions): void {
    const [cx, cy] = centroid(part);
    const verts = part.map(([x, y]) => ({ x, y }));
    const body = this.matter.add.fromVertices(cx, cy, [verts], {
      isStatic: true,
      isSensor: options.isSensor,
      label,
    }) as unknown as {
      position: { x: number; y: number };
      bounds: { min: { x: number; y: number } };
    };
    // Concave decomposition only approximates placement, so snap the body
    // bounds back onto the source polygon.
    const dx = Math.min(...part.map(([x]) => x)) - body.bounds.min.x;
    const dy = Math.min(...part.map(([, y]) => y)) - body.bounds.min.y;
    if (dx !== 0 || dy !== 0) {
      (this.matter.body as unknown as MatterBodyModule).setPosition(body, {
        x: body.position.x + dx,
        y: body.position.y + dy,
      });
    }
    this.applySurface(body, options);
  }

  private applySurface(body: unknown, options: BodyOptions): void {
    // Body.setStatic() resets restitution/friction on creation, so assign
    // them afterwards, on the body and every compound part.
    const surface = body as MatterSurface;
    const targets = [surface, ...(surface.parts ?? [])];
    for (const target of targets) {
      target.restitution = options.restitution;
      target.friction = options.friction;
      target.frictionStatic = options.frictionStatic;
    }
  }

  private handleCollision(
    labelA: string | undefined,
    labelB: string | undefined,
    started: boolean,
  ): void {
    const other =
      labelA === "player" ? labelB : labelB === "player" ? labelA : undefined;
    if (other === undefined) {
      return;
    }
    if (other === "goal") {
      if (started) {
        this.win();
      }
      return;
    }
    if (other.startsWith("hazard:")) {
      if (started) {
        this.respawn();
      }
      return;
    }
    if (other.startsWith("solid:")) {
      if (started) {
        this.groundSolids.add(other);
      } else {
        this.groundSolids.delete(other);
      }
    }
  }

  private onSlippery(): boolean {
    for (const label of this.groundSolids) {
      if (this.roleById.get(label.slice("solid:".length)) === "slippery") {
        return true;
      }
    }
    return false;
  }

  private respawn(): void {
    if (!this.player || this.won) {
      return;
    }
    const [x, y] = this.level.start;
    (this.matter.body as unknown as MatterBodyModule).setPosition(
      this.player.body,
      { x, y },
    );
    this.player.setVelocity(0, 0);
    this.groundSolids.clear();
  }

  private win(): void {
    if (this.won) {
      return;
    }
    this.won = true;
    this.player?.setVelocity(0, 0);
    this.callbacks.onWin();
  }

  private drawLevelArt(): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(ART_FILL, 0.85);
    gfx.lineStyle(2, ART_LINE);
    for (const object of this.level.objects) {
      for (const part of object.parts) {
        const points = part.map(([x, y]) => ({ x, y }));
        gfx.fillPoints(points, true);
        gfx.strokePoints(points, true);
      }
    }
  }

  private toggleDebug(): void {
    const gfx = this.debugGfx;
    if (!gfx) {
      return;
    }
    this.debugOn = !this.debugOn;
    gfx.clear();
    for (const label of this.debugLabels) {
      label.destroy();
    }
    this.debugLabels = [];
    if (!this.debugOn) {
      return;
    }
    for (const object of this.level.objects) {
      const { debugColor } = roleToBodyOptions(object.role);
      gfx.lineStyle(3, debugColor);
      gfx.fillStyle(debugColor, 0.18);
      for (const part of object.parts) {
        const points = part.map(([x, y]) => ({ x, y }));
        gfx.fillPoints(points, true);
        gfx.strokePoints(points, true);
      }
      const xs = object.parts.flat().map(([x]) => x);
      const ys = object.parts.flat().map(([, y]) => y);
      const tag = this.add.text(
        Math.min(...xs),
        Math.max(16, Math.min(...ys) - 4),
        `${object.label}: ${object.role} — ${object.reason}`,
        { fontSize: "14px", color: "#ffffff", backgroundColor: "#000000" },
      );
      tag.setOrigin(0, 1).setDepth(11);
      this.debugLabels.push(tag);
    }
    gfx.lineStyle(3, 0x22c55e);
    gfx.strokeRect(0, this.level.height - 8, this.level.width, 8);
  }
}
