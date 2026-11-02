import decomp from "poly-decomp";
import type { Level, LevelObject, Point, Role } from "../level";
import { maxGapPx, maxRisePx, playerSize } from "../../game/physics";
import { signedArea } from "./toPolygons";

export const SPARSE_HINT =
  "Tip: brighter photos with bigger objects make better levels";

/** Matter's minimumArea default: decomposed chunks under this never survive. */
const MIN_DECOMP_AREA = 10;

export interface AssembledObject {
  label: string;
  phrase: string;
  reason: string;
  role: Role;
  /** Kept mask area in pixels (sizes promotion order). */
  area: number;
  polygons: Point[][];
}

export interface AssembleInput {
  objects: AssembledObject[];
  /** Data URL of the resized photo used as the background. */
  image: string;
  width: number;
  height: number;
  timings: Record<string, number>;
}

export interface AssembleResult {
  level: Level;
  /** Human-readable log of every deterministic fix applied. */
  notes: string[];
}

type Box = [number, number, number, number]; // x1, y1, x2, y2

function bbox(parts: Point[][]): Box {
  const xs = parts.flat().map(([x]) => x);
  const ys = parts.flat().map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function containsPoint(ring: Point[], [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (p: Point, q: Point, r: Point): number =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** Whether an axis-aligned rect touches a ring (corner inside or edge cross). */
function rectHitsRing(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ring: Point[],
): boolean {
  const corners: Point[] = [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
  if (corners.some((c) => containsPoint(ring, c))) {
    return true;
  }
  const edges: Array<[Point, Point]> = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (edges.some(([c, d]) => segmentsCross(a, b, c, d))) {
      return true;
    }
  }
  return false;
}

/** Topmost surface y of a part at x (ray cast down), or null when x misses. */
function topSurfaceAtX(part: Point[], x: number): number | null {
  let top: number | null = null;
  for (let i = 0; i < part.length; i++) {
    const [x1, y1] = part[i];
    const [x2, y2] = part[(i + 1) % part.length];
    if ((x1 < x && x2 >= x) || (x2 < x && x1 >= x)) {
      const y = y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      if (top === null || y < top) {
        top = y;
      }
    }
  }
  return top;
}

/** Drop hole loops: parts fully contained in a larger part of the same object. */
export function dropContainedParts(parts: Point[][]): Point[][] {
  return parts.filter(
    (part) =>
      !parts.some(
        (other) => other !== part && containsPoint(other, part[0]),
      ),
  );
}

/**
 * Matter's fromVertices drops decomposed chunks under 10px² and returns
 * undefined when zero chunks survive, which kills the whole scene. Drop
 * parts that cannot form a body: sub-10px² rings, and rings whose
 * poly-decomp chunks (same library and version as Phaser's bundle) all
 * fall under 10px². Runs the decomp check on every part so the gate can
 * never disagree with the consumer about convexity.
 */
export function dropUnviableParts(parts: Point[][]): Point[][] {
  return parts.filter((part) => {
    const area = Math.abs(signedArea(part));
    if (!Number.isFinite(area) || area < MIN_DECOMP_AREA) {
      return false;
    }
    const concave = part.map(([x, y]): [number, number] => [x, y]);
    decomp.makeCCW(concave);
    decomp.removeCollinearPoints(concave, 0.01);
    if (decomp.removeDuplicatePoints) {
      decomp.removeDuplicatePoints(concave, 0.01);
    }
    let chunks: [number, number][][];
    try {
      chunks = decomp.quickDecomp(concave);
    } catch {
      return false;
    }
    return chunks.some(
      (chunk) => Math.abs(signedArea(chunk as Point[])) >= MIN_DECOMP_AREA,
    );
  });
}

interface Platform {
  object: LevelObject;
  box: Box;
}

/**
 * Pick a spawn with support underfoot, headroom above, and an
 * intersection-free body rect (the static settle test). Platforms are tried
 * left to right so the start stays on the leftmost viable platform. Returns
 * the hosting platform too (null when falling back to the floor).
 */
function pickStart(
  platforms: Platform[],
  parts: Point[][],
  width: number,
  height: number,
): { point: Point; platform: Platform | null } {
  const { pw, ph } = playerSize(width, height);
  const ordered = [...platforms].sort((a, b) => a.box[0] - b.box[0]);
  for (const platform of ordered) {
    for (const part of platform.object.parts) {
      const [x1, , x2] = bbox([part]);
      for (let s = 0; s <= 8; s++) {
        const x = x1 + ((x2 - x1) * (s + 0.5)) / 9;
        const topY = topSurfaceAtX(part, x);
        if (topY === null) {
          continue;
        }
        const y = topY - ph / 2 - 4;
        if (y < ph) {
          continue; // Too close to the world top to stand.
        }
        // Support: part surface continues under both feet.
        const feet =
          containsPoint(part, [x - pw / 2, topY + 2]) &&
          containsPoint(part, [x + pw / 2, topY + 2]);
        // Settle: the body rect and the headroom column are both empty.
        const bodyFree = !parts.some((ring) =>
          rectHitsRing(x - pw / 2, y - ph / 2, x + pw / 2, y + ph / 2, ring),
        );
        const headFree = !parts.some((ring) =>
          rectHitsRing(x - pw / 2, topY - ph - 8, x + pw / 2, topY - 1, ring),
        );
        if (feet && bodyFree && headFree) {
          return { point: [Math.round(x), Math.round(y)], platform };
        }
      }
    }
  }
  return { point: [Math.round(width * 0.1), height - 60], platform: null };
}

const FLOOD_CELL = 8;
const GEN_NOTE = "Added a generated platform so the goal stays clear of the start.";

function cellKey(x: number, y: number, cols: number): number {
  return Math.floor(y / FLOOD_CELL) * cols + Math.floor(x / FLOOD_CELL);
}

/**
 * Whether any flooded cell overlaps the rect. A single containing cell is
 * not robust: a slot sitting exactly ph/2 above its surface lands in a
 * cell whose center dips into the erosion band. The body rect spans
 * several cells, so overlap is the grid-robust occupancy test.
 */
function rectTouchesFlood(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  flooded: Set<number>,
  cols: number,
): boolean {
  for (let iy = Math.floor(y1 / FLOOD_CELL); iy <= Math.floor(y2 / FLOOD_CELL); iy++) {
    for (
      let ix = Math.floor(x1 / FLOOD_CELL);
      ix <= Math.floor(x2 / FLOOD_CELL);
      ix++
    ) {
      if (flooded.has(iy * cols + ix)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Cells the player body can occupy, flooded 4-connected from the start (no
 * diagonal corner-cutting). A cell is open iff the player fits centered in
 * it: the body rect, shaved 1px per side so edge-tangent contact counts as
 * fitting, must miss every blocking part. Cells whose center sits below
 * H - ph/2 are excluded: no alive transit under the world floor (the scene
 * respawns at H + 60, so this is conservative by design).
 */
function floodFrom(
  start: Point,
  blockingParts: Point[][],
  width: number,
  height: number,
): Set<number> {
  const { pw, ph } = playerSize(width, height);
  const cols = Math.ceil(width / FLOOD_CELL);
  const rows = Math.ceil(height / FLOOD_CELL);
  const maxCy = height - ph / 2;
  // Part bounding boxes first so far cells reject in O(1).
  const boxes = blockingParts.map((ring) => bbox([ring]));
  const blocked = (ix: number, iy: number): boolean => {
    const cx = ix * FLOOD_CELL + FLOOD_CELL / 2;
    const cy = iy * FLOOD_CELL + FLOOD_CELL / 2;
    if (cx < 0 || cx >= width || cy < 0 || cy > maxCy) {
      return true;
    }
    const x1 = cx - pw / 2 + 1;
    const y1 = cy - ph / 2 + 1;
    const x2 = cx + pw / 2 - 1;
    const y2 = cy + ph / 2 - 1;
    return blockingParts.some((ring, i) => {
      const [bx1, by1, bx2, by2] = boxes[i];
      if (x2 < bx1 || x1 > bx2 || y2 < by1 || y1 > by2) {
        return false;
      }
      return rectHitsRing(x1, y1, x2, y2, ring);
    });
  };
  const seen = new Set<number>();
  const seedIx = Math.floor(start[0] / FLOOD_CELL);
  const seedIy = Math.floor(start[1] / FLOOD_CELL);
  const queue: Array<[number, number]> = [[seedIx, seedIy]];
  while (queue.length > 0) {
    const [ix, iy] = queue.pop() as [number, number];
    if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) {
      continue;
    }
    const key = iy * cols + ix;
    if (seen.has(key)) {
      continue;
    }
    // The seed is forced open: pickStart fit the body by exact rects, so a
    // conservative grid cell there must not strand the flood.
    if ((ix !== seedIx || iy !== seedIy) && blocked(ix, iy)) {
      continue;
    }
    seen.add(key);
    queue.push([ix + 1, iy], [ix - 1, iy], [ix, iy + 1], [ix, iy - 1]);
  }
  return seen;
}

interface GoalSpot {
  point: Point;
  platform: Platform;
  moved: boolean;
}

/**
 * First clear slot at least minDist from the start: platforms farthest
 * first by midpoint, slots midpoint-out within each part, restricted to
 * flood-reached airspace (the standing body must overlap a flooded cell).
 * Null when no platform qualifies; the caller decides what a miss means
 * (next pass, generation, or fallback).
 */
function pickGoal(
  platforms: Platform[],
  exclude: Platform | null,
  parts: Point[][],
  startX: number,
  width: number,
  height: number,
  flooded: Set<number>,
  minDist: number,
): GoalSpot | null {
  const gr = Math.min(width, height) * 0.024;
  const { pw, ph } = playerSize(width, height);
  const cols = Math.ceil(width / FLOOD_CELL);
  const mid = (p: Platform): number => (p.box[0] + p.box[2]) / 2;
  const ordered = [...platforms]
    .filter((p) => p !== exclude)
    .sort((a, b) => Math.abs(mid(b) - startX) - Math.abs(mid(a) - startX));
  // Midpoint first, then outward: the goal stays centered when it can.
  const slots = [4, 3, 5, 2, 6, 1, 7, 0, 8];
  for (const [index, platform] of ordered.entries()) {
    for (const part of platform.object.parts) {
      const [x1, , x2] = bbox([part]);
      for (const s of slots) {
        const x = x1 + ((x2 - x1) * (s + 0.5)) / 9;
        if (Math.abs(x - startX) < minDist) {
          continue;
        }
        const topY = topSurfaceAtX(part, x);
        if (topY === null) {
          continue;
        }
        const y = topY - gr;
        if (y < gr * 2) {
          continue;
        }
        // Trigger box plus headroom, strictly above the surface so the host
        // platform's own top never counts as a hit.
        const clear = !parts.some((ring) =>
          rectHitsRing(x - gr, topY - gr * 2 - 8, x + gr, topY - 1, ring),
        );
        if (!clear) {
          continue;
        }
        // The standing body must fit exactly (bottom shaved: resting on the
        // host top counts as fitting) and overlap flooded airspace.
        const bodyFits = !parts.some((ring) =>
          rectHitsRing(x - pw / 2, topY - ph, x + pw / 2, topY - 1, ring),
        );
        if (!bodyFits) {
          continue;
        }
        if (
          !rectTouchesFlood(x - pw / 2, topY - ph, x + pw / 2, topY, flooded, cols)
        ) {
          continue;
        }
        return {
          point: [Math.round(x), Math.round(y)],
          platform,
          moved: index > 0,
        };
      }
    }
  }
  return null;
}

/**
 * Placement for a generated goal step: the flooded cell farthest
 * (horizontally) from the start that also sits within jump margins of a
 * box-reached solid, so the step is neither sealed nor a sky island.
 * First non-embedding candidate wins; the start cell always qualifies, so
 * this terminates (pocket best-effort when the floor is unmeetable).
 */
function generationSpec(
  flooded: Set<number>,
  start: Point,
  width: number,
  height: number,
  boxReached: Platform[],
  blockingParts: Point[][],
): { cx: number; top: number } {
  const { ph } = playerSize(width, height);
  const half = Math.round(width * 0.09);
  const gap = maxGapPx(width, height);
  const rise = maxRisePx(height);
  const cols = Math.ceil(width / FLOOD_CELL);
  const cells: Array<{ cx: number; cy: number }> = [];
  for (const key of flooded) {
    const cx = (key % cols) * FLOOD_CELL + FLOOD_CELL / 2;
    const cy = Math.floor(key / cols) * FLOOD_CELL + FLOOD_CELL / 2;
    const near = boxReached.some((p) => {
      const hGap = Math.max(0, p.box[0] - cx, cx - p.box[2]);
      return hGap <= gap && p.box[1] - cy <= rise;
    });
    if (near) {
      cells.push({ cx, cy });
    }
  }
  cells.sort(
    (a, b) =>
      Math.abs(b.cx - start[0]) - Math.abs(a.cx - start[0]) ||
      Math.abs(a.cy - start[1]) - Math.abs(b.cy - start[1]),
  );
  for (const { cx, cy } of cells) {
    const x = Math.min(Math.max(Math.round(cx), half), width - half);
    const top = Math.round(cy + ph / 2);
    const embeds = blockingParts.some((ring) =>
      rectHitsRing(x - half, top, x + half, top + 12, ring),
    );
    if (!embeds) {
      return { cx: x, top };
    }
  }
  return { cx: Math.round(start[0]), top: Math.round(start[1] + ph / 2) };
}

/** Platforms reachable from `from` by jumps (identity is by platform). */
function reachableSet(
  from: Platform,
  platforms: Platform[],
  width: number,
  height: number,
): Set<Platform> {
  const rise = maxRisePx(height);
  const gap = maxGapPx(width, height);
  const seen = new Set<Platform>([from]);
  const queue: Platform[] = [from];
  while (queue.length > 0) {
    const current = queue.pop() as Platform;
    for (const next of platforms) {
      if (seen.has(next)) {
        continue;
      }
      const horizontalGap = Math.max(
        0,
        next.box[0] - current.box[2],
        current.box[0] - next.box[2],
      );
      const climb = current.box[1] - next.box[1];
      if (horizontalGap <= gap && climb <= rise) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function rectPart(x1: number, y1: number, x2: number, y2: number): Point[] {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
}

export function assembleLevel(input: AssembleInput): AssembleResult {
  const { width, height } = input;
  const notes: string[] = [];
  const objects: LevelObject[] = [];
  input.objects.forEach((obj, index) => {
    const parts = dropUnviableParts(dropContainedParts(obj.polygons));
    if (parts.length === 0) {
      return;
    }
    objects.push({
      id: `obj-${index}`,
      label: obj.label,
      phrase: obj.phrase,
      role: obj.role,
      reason: obj.reason,
      parts,
    });
  });

  const countRole = (role: Role): number =>
    objects.filter((o) => o.role === role).length;

  // Deterministic repair: fewer than two platforms → promote the largest.
  if (objects.length > 0 && countRole("platform") < 2) {
    const byArea = input.objects
      .map((obj, index) => ({ obj, index }))
      .filter(({ obj }) => obj.polygons.length > 0)
      .sort((a, b) => b.obj.area - a.obj.area);
    for (const { index } of byArea) {
      if (countRole("platform") >= 2) {
        break;
      }
      const target = objects.find((o) => o.id === `obj-${index}`);
      if (target && target.role !== "platform") {
        target.role = "platform";
        notes.push(`Promoted ${target.label} to platform.`);
      }
    }
  }

  // PRD step 5: fewer than three platforms → add a ground floor.
  if (countRole("platform") < 3) {
    objects.push({
      id: "ground",
      label: "ground",
      phrase: "ground",
      role: "platform",
      reason: "Added so the level has a floor.",
      parts: [rectPart(0, height - 24, width, height)],
    });
    notes.push("Added a ground floor.");
  }

  // Sparse photos: still fewer than three objects → generated steps + hint.
  let hint: string | undefined;
  if (objects.length < 3) {
    const missing = 3 - objects.length;
    for (let i = 0; i < missing; i++) {
      const cx = (width * (i + 1)) / (missing + 1);
      const top = height - 24 - Math.round(height * 0.12 * (i + 1));
      const half = Math.round(width * 0.09);
      objects.push({
        id: `step-${i}`,
        label: "stepping platform",
        phrase: "stepping platform",
        role: "platform",
        reason: "Generated so the level stays traversable.",
        parts: [rectPart(cx - half, top, cx + half, top + 12)],
      });
    }
    hint = SPARSE_HINT;
    notes.push("Added generated platforms for a sparse photo.");
  }

  const platforms: Platform[] = objects
    .filter((o) => o.role === "platform")
    .map((o) => ({ object: o, box: bbox(o.parts) }));
  // Traversal may cross every solid role; only platforms host start/goal.
  const solids: Platform[] = objects
    .filter(
      (o) => o.role === "platform" || o.role === "bouncy" || o.role === "slippery",
    )
    .map((o) => ({ object: o, box: bbox(o.parts) }));
  const solidById = new Map(solids.map((s) => [s.object.id, s]));
  const allParts = objects.flatMap((o) => o.parts);
  // Goal freeness ignores decor (no bodies in the scene) but keeps hazards:
  // a win zone must be enterable without dying.
  const blockingParts = objects
    .filter((o) => o.role !== "decor")
    .flatMap((o) => o.parts);

  const picked = pickStart(platforms, allParts, width, height);
  const start = picked.point;

  const startBox =
    picked.platform ??
    platforms.reduce((a, b) =>
      Math.abs((a.box[0] + a.box[2]) / 2 - start[0]) <
      Math.abs((b.box[0] + b.box[2]) / 2 - start[0])
        ? a
        : b,
    );
  const startSolid = solidById.get(startBox.object.id) as Platform;
  // Reachability is a hybrid: the box BFS below is jump-aware but blind to
  // walls inside boxes, so the flood (seal-aware, jump-blind) gates every
  // goal spot first. Both must pass.
  let flooded = floodFrom(start, blockingParts, width, height);
  const floor = Math.max(width * 0.2, 150);
  const spot = (
    plats: Platform[],
    exclude: Platform | null,
    minDist: number,
  ): GoalSpot | null =>
    pickGoal(
      plats,
      exclude,
      blockingParts,
      start[0],
      width,
      height,
      flooded,
      minDist,
    );
  let stepCounter = 0;
  const placeGeneratedStep = (boxReached: Platform[]): Platform => {
    const spec = generationSpec(
      flooded,
      start,
      width,
      height,
      boxReached,
      blockingParts,
    );
    const half = Math.round(width * 0.09);
    const step: LevelObject = {
      id: stepCounter === 0 ? "goal-step" : `goal-step-${stepCounter + 1}`,
      label: "stepping platform",
      phrase: "stepping platform",
      role: "platform",
      reason: "Generated so the goal stays clear of the start.",
      parts: [
        rectPart(spec.cx - half, spec.top, spec.cx + half, spec.top + 12),
      ],
    };
    stepCounter++;
    objects.push(step);
    const plat: Platform = { object: step, box: bbox(step.parts) };
    platforms.push(plat);
    solids.push(plat);
    solidById.set(step.id, plat);
    blockingParts.push(...step.parts);
    flooded = floodFrom(start, blockingParts, width, height);
    notes.push(GEN_NOTE);
    return plat;
  };
  // Goal on the generated step if it qualifies, else the farthest viable
  // spot anywhere (pocket best-effort), else the floor fallback.
  const pickOnStep = (step: Platform): GoalSpot | null =>
    spot([step], null, width * 0.4) ??
    spot([step], null, floor) ??
    spot(platforms, null, 0);
  const closerCheck = (g: Point): void => {
    if (Math.abs(g[0] - start[0]) < width * 0.4) {
      notes.push("Goal closer than 40% of the level width.");
    }
  };
  let goal: Point;
  let host: Platform | null;
  const initial =
    spot(platforms, startBox, width * 0.4) ?? spot(platforms, startBox, floor);
  if (initial) {
    goal = initial.point;
    host = initial.platform;
    if (initial.moved) {
      notes.push("Moved the goal to an open spot.");
    }
  } else {
    const step = placeGeneratedStep([
      ...reachableSet(startSolid, solids, width, height),
    ]);
    const repick = pickOnStep(step);
    if (repick) {
      goal = repick.point;
      host = repick.platform;
    } else {
      goal = [width - 60, height - 60];
      host = null;
    }
  }
  closerCheck(goal);
  if (host !== null) {
    const goalSolid = solidById.get(host.object.id) as Platform;
    if (!reachableSet(startSolid, solids, width, height).has(goalSolid)) {
      // One mid-way stepping platform, then nudge the goal to the farthest
      // solid actually reachable if the gap is still broken.
      const startMid = (startBox.box[0] + startBox.box[2]) / 2;
      const goalMid = (host.box[0] + host.box[2]) / 2;
      const midX = Math.round((startMid + goalMid) / 2);
      const midTop = Math.round((startBox.box[1] + host.box[1]) / 2);
      const half = Math.round(width * 0.09);
      const step: LevelObject = {
        id: "reach-step",
        label: "stepping platform",
        phrase: "stepping platform",
        role: "platform",
        reason: "Generated to bridge an unreachable gap.",
        parts: [rectPart(midX - half, midTop, midX + half, midTop + 12)],
      };
      objects.push(step);
      const stepPlatform: Platform = { object: step, box: bbox(step.parts) };
      platforms.push(stepPlatform);
      solids.push(stepPlatform);
      solidById.set(step.id, stepPlatform);
      blockingParts.push(...step.parts);
      flooded = floodFrom(start, blockingParts, width, height);
      notes.push("Added a stepping platform to bridge a gap.");
      const reached = reachableSet(startSolid, solids, width, height);
      if (!reached.has(goalSolid)) {
        const nudge =
          spot([...reached], null, width * 0.4) ??
          spot([...reached], null, floor);
        if (nudge) {
          goal = nudge.point;
          host = nudge.platform;
          notes.push("Moved the goal onto a reachable platform.");
        } else {
          const step2 = placeGeneratedStep([...reached]);
          const repick2 = pickOnStep(step2);
          if (repick2) {
            goal = repick2.point;
            host = repick2.platform;
          } else {
            goal = [width - 60, height - 60];
            host = null;
          }
        }
        closerCheck(goal);
      }
    }
  }

  return {
    level: {
      width,
      height,
      image: input.image,
      objects,
      start,
      goal,
      timings: input.timings,
      ...(hint ? { hint } : {}),
    },
    notes,
  };
}

/**
 * Goal-placement playability checks for finished levels (sweep/export time,
 * never a route upload reject): the trigger box plus a player-sized headroom
 * column must be empty of every blocking part (every role except decor),
 * and the goal must sit at least 40% of the level width from the start.
 * Returns issues, empty when well placed.
 */
export function goalPlacementIssues(level: Level): string[] {
  const issues: string[] = [];
  const { width, height, start, goal } = level;
  const gr = Math.min(width, height) * 0.024;
  const [gx, gy] = goal;
  const parts = level.objects
    .filter((o) => o.role !== "decor")
    .flatMap((o) => o.parts);
  // Same rect the assembler guarantees, shaved 1px off the bottom so resting
  // exactly on the host top does not count as a hit.
  const blocked = parts.some((ring) =>
    rectHitsRing(gx - gr, gy - gr - 8, gx + gr, gy + gr - 1, ring),
  );
  if (blocked) {
    issues.push("goal trigger box or headroom is blocked");
  }
  const dx = Math.abs(gx - start[0]);
  if (dx < width * 0.4) {
    issues.push(
      `goal ${Math.round(dx)}px from the start, under 40% of the level width`,
    );
  }
  return issues;
}

/**
 * Whether the goal is flood-reachable from the start (sweep/export-time
 * seal check): same grid, erosion, and seed as the assembler; the standing
 * body below the goal must overlap flooded airspace.
 */
export function goalReachableByFlood(level: Level): boolean {
  const { width, height, start, goal } = level;
  const parts = level.objects
    .filter((o) => o.role !== "decor")
    .flatMap((o) => o.parts);
  const flooded = floodFrom(start, parts, width, height);
  const gr = Math.min(width, height) * 0.024;
  const { pw, ph } = playerSize(width, height);
  const cols = Math.ceil(width / FLOOD_CELL);
  const topY = goal[1] + gr;
  return rectTouchesFlood(
    goal[0] - pw / 2,
    topY - ph,
    goal[0] + pw / 2,
    topY,
    flooded,
    cols,
  );
}
