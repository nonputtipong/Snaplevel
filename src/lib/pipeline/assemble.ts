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

  const picked = pickStart(platforms, allParts, width, height);
  const start = picked.point;

  const gr = Math.min(width, height) * 0.024;
  const startBox =
    picked.platform ??
    platforms.reduce((a, b) =>
      Math.abs((a.box[0] + a.box[2]) / 2 - start[0]) <
      Math.abs((b.box[0] + b.box[2]) / 2 - start[0])
        ? a
        : b,
    );
  const others = platforms.filter((p) => p !== startBox);
  const goalBox =
    others.length === 0
      ? null
      : others.reduce((a, b) => (a.box[2] > b.box[2] ? a : b));
  const goalPlatform =
    others.length === 0
      ? null
      : others.reduce((a, b) => (a.box[2] > b.box[2] ? a : b));
  const topPoint = (box: Box): Point => [
    Math.round((box[0] + box[2]) / 2),
    Math.max(Math.round(gr * 2), Math.round(box[1] - gr)),
  ];
  let goal: Point;
  if (goalPlatform === null) {
    goal = [width - 60, height - 60];
  } else {
    goal = topPoint(goalPlatform.box);
    const startSolid = solidById.get(startBox.object.id) as Platform;
    const goalSolid = solidById.get(goalPlatform.object.id) as Platform;
    if (!reachableSet(startSolid, solids, width, height).has(goalSolid)) {
      // One mid-way stepping platform, then nudge the goal to the farthest
      // solid actually reachable if the gap is still broken.
      const startMid = (startBox.box[0] + startBox.box[2]) / 2;
      const goalMid = (goalPlatform.box[0] + goalPlatform.box[2]) / 2;
      const midX = Math.round((startMid + goalMid) / 2);
      const midTop = Math.round((startBox.box[1] + goalPlatform.box[1]) / 2);
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
      notes.push("Added a stepping platform to bridge a gap.");
      const reached = reachableSet(startSolid, solids, width, height);
      if (!reached.has(goalSolid)) {
        const fallback = [...reached].reduce((a, b) =>
          a.box[2] > b.box[2] ? a : b,
        );
        goal = topPoint(fallback.box);
        notes.push("Moved the goal onto a reachable platform.");
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
