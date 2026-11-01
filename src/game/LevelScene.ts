import * as Phaser from "phaser";
import type { Level, Point, Role } from "@/lib/level";
import { centroid } from "./geometry";
import { roleToBodyOptions, type BodyOptions } from "./roles";
import { PLAYER_JUMP, PLAYER_SPEED, playerSize } from "./physics";
import { releaseTouch, takeQueuedJump, touchInput } from "./touchInput";
import { resolveFrameInput } from "./frameInput";
import {
  findFreeSpot,
  nextRescueState,
  pointInPolygon,
  type RescueState,
} from "./rescue";
import { playSfx } from "./sfx";

export interface LevelSceneCallbacks {
  onWin: () => void;
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
const GOAL_COLOR = 0x22d3ee;

// Camera: hold the full-level fit, then ease to a follow zoom on small
// displays. FOLLOW_MIN_SHORT_SIDE is canvas CSS px: a phone portrait fit
// (~270px short side) engages follow, a desktop fit (~750px) stays whole.
const CAMERA_HOLD_MS = 1500;
const FOLLOW_ZOOM = 1.2;
const FOLLOW_MIN_SHORT_SIDE = 480;

export class LevelScene extends Phaser.Scene {
  private level: Level;
  private callbacks: LevelSceneCallbacks;
  private player?: Phaser.Physics.Matter.Image;
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
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti?: Phaser.GameObjects.Particles.ParticleEmitter;
  private solidParts: Point[][] = [];
  private rescueState: RescueState = { airFrames: 0 };

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
    this.solidParts = [];
    this.rescueState = { airFrames: 0 };
    this.won = false;
    this.debugOn = false;

    this.makeTextures();
    this.add.image(0, 0, "bg").setOrigin(0).setDisplaySize(width, height);
    this.drawLevelArt();
    this.debugGfx = this.add.graphics().setDepth(10);
    this.dust = this.add.particles(0, 0, "sl-dot", {
      speed: { min: 40, max: 130 },
      lifespan: 350,
      quantity: 0,
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: 0xe2e8f0,
    });
    this.dust.setDepth(9);
    this.confetti = this.add.particles(0, 0, "sl-dot", {
      speed: { min: 150, max: 360 },
      gravityY: 500,
      lifespan: 1000,
      quantity: 0,
      scale: { start: 1, end: 0 },
      tint: [0x34d399, 0x22d3ee, 0xfbbf24, 0xf472b6],
    });
    this.confetti.setDepth(12);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, width, height);
    this.time.delayedCall(CAMERA_HOLD_MS, () => this.engageFollowCamera());

    for (const object of this.level.objects) {
      const options = roleToBodyOptions(object.role);
      if (!options.collides) {
        continue;
      }
      const kind = object.role === "hazard" ? "hazard" : "solid";
      if (!options.isSensor) {
        this.solidParts.push(...object.parts);
      }
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
    const player = this.matter.add.image(sx, sy, "sl-player", undefined, {
      label: "player",
      restitution: 0,
      friction: 0.1,
      shape: { type: "rectangle", width: pw, height: ph },
    });
    player.setDisplaySize(pw, ph);
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
      player.setFlipX(frame.vx < 0);
    } else if (!this.onSlippery()) {
      player.setVelocityX(0);
    }
    if (frame.jump) {
      player.setVelocityY(-this.level.height * PLAYER_JUMP);
      this.dust?.explode(6, player.x, player.y + player.displayHeight / 2);
      playSfx("jump");
    }
    this.maybeRescue(player);
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
        if (this.roleById.get(other.slice("solid:".length)) === "bouncy") {
          this.bounceEffect();
        }
      } else {
        this.groundSolids.delete(other);
      }
    }
  }

  private bounceEffect(): void {
    const player = this.player;
    if (!player) {
      return;
    }
    playSfx("bounce");
    const ring = this.add
      .circle(player.x, player.y, 12)
      .setStrokeStyle(4, 0xfbbf24)
      .setDepth(9);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 300,
      onComplete: () => ring.destroy(),
    });
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
    this.rescueState = { airFrames: 0 };
    playSfx("respawn");
    this.dust?.explode(8, x, y);
    this.player.setAlpha(0.25);
    this.tweens.add({ targets: this.player, alpha: 1, duration: 400 });
  }

  private win(): void {
    if (this.won) {
      return;
    }
    this.won = true;
    this.player?.setVelocity(0, 0);
    playSfx("win");
    const [gx, gy] = this.level.goal;
    this.confetti?.explode(36, gx, gy);
    this.cameras.main.flash(250, 255, 255, 255);
    this.callbacks.onWin();
  }

  private drawLevelArt(): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(ART_FILL, 0.85);
    gfx.lineStyle(2, ART_LINE);
    for (const object of this.level.objects) {
      const options = roleToBodyOptions(object.role);
      const solid = options.collides && !options.isSensor;
      for (const part of object.parts) {
        const points = part.map(([x, y]) => ({ x, y }));
        gfx.fillPoints(points, true);
        gfx.strokePoints(points, true);
        if (solid) {
          gfx.lineStyle(7, 0xffffff, 0.1);
          gfx.strokePoints(points, true);
          gfx.lineStyle(2, 0xffffff, 0.35);
          gfx.strokePoints(points, true);
          gfx.lineStyle(2, ART_LINE);
        }
      }
    }
  }

  /** Code-drawn textures: the player sprite and a particle dot. Guarded
   * because create() re-runs on scene restart. */
  private makeTextures(): void {
    if (!this.textures.exists("sl-player")) {
      const body = this.add.graphics();
      body.fillStyle(0x34d399, 1);
      body.fillRoundedRect(0, 0, 48, 60, 14);
      body.fillStyle(0xffffff, 1);
      body.fillCircle(16, 24, 7);
      body.fillCircle(32, 24, 7);
      body.fillStyle(0x0f172a, 1);
      body.fillCircle(18, 25, 3.5);
      body.fillCircle(34, 25, 3.5);
      body.generateTexture("sl-player", 48, 60);
      body.destroy();
    }
    if (!this.textures.exists("sl-dot")) {
      const dot = this.add.graphics();
      dot.fillStyle(0xffffff, 1);
      dot.fillCircle(8, 8, 8);
      dot.generateTexture("sl-dot", 16, 16);
      dot.destroy();
    }
  }

  /** After the full-level hold, ease into a follow zoom on small displays;
   * large displays keep the whole level with no follow. */
  private engageFollowCamera(): void {
    const player = this.player;
    if (!player || !this.scene.isActive()) {
      return;
    }
    const bounds = this.scale.canvasBounds;
    if (Math.min(bounds.width, bounds.height) >= FOLLOW_MIN_SHORT_SIDE) {
      return;
    }
    const cam = this.cameras.main;
    cam.zoomTo(FOLLOW_ZOOM, 900, "Sine.easeInOut");
    cam.startFollow(player, false, 0.08, 0.08);
    cam.setDeadzone(this.level.width * 0.2, this.level.height * 0.15);
  }

  private maybeRescue(player: Phaser.Physics.Matter.Image): void {
    const decision = nextRescueState(this.rescueState, {
      embedded: this.isEmbedded(player.x, player.y),
      hasContact: this.groundSolids.size > 0,
      aboveKillLine: player.y <= this.level.height + 60,
    });
    this.rescueState = decision.state;
    if (!decision.rescue) {
      return;
    }
    const spot = findFreeSpot(player.x, player.y, (x, y) =>
      this.isEmbedded(x, y),
    ) ?? { x: player.x, y: player.y - 120 };
    const x = Math.min(Math.max(spot.x, 8), this.level.width - 8);
    const y = Math.min(Math.max(spot.y, 8), this.level.height - 8);
    (this.matter.body as unknown as MatterBodyModule).setPosition(
      player.body,
      { x, y },
    );
    player.setVelocity(0, 0);
    this.groundSolids.clear();
    this.dust?.explode(8, x, y);
  }

  /** True when a point sits inside the floor strip or any solid part. */
  private isEmbedded(x: number, y: number): boolean {
    const { width, height } = this.level;
    if (x >= 0 && x <= width && y >= height - 8 && y <= height) {
      return true;
    }
    return this.solidParts.some((part) => pointInPolygon(part, x, y));
  }

  /** Public outline toggle for the HUD button (touch has no D key). */
  toggleOutlines(): void {
    this.toggleDebug();
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
