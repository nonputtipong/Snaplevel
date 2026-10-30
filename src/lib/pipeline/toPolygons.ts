import type { Point } from "../level";

export const MAX_VERTICES_PER_PART = 40;

export interface PolygonInput {
  svgPath: string;
  /** [x1, y1, x2, y2]: the offset the raster-local path sits at. */
  box: [number, number, number, number];
}

/**
 * Split an M/L/Z-only path into local-coord vertex rings. The mask encoder
 * emits absolute M/L commands with Z-closed subpaths concatenated without
 * separators, so a general SVG parser is unnecessary.
 */
function parseSubpaths(svgPath: string): Point[][] {
  const parts: Point[][] = [];
  for (const sub of svgPath.split("M")) {
    if (!sub.trim()) {
      continue;
    }
    const points: Point[] = [];
    for (const token of sub.split("L")) {
      const nums = token.replace("Z", "").trim().split(/\s+/).map(Number);
      if (nums.length >= 2 && nums.every(Number.isFinite)) {
        points.push([nums[0], nums[1]]);
      }
    }
    if (points.length > 0) {
      parts.push(points);
    }
  }
  return parts;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker over an open vertex list (iterative; keeps order). */
function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) {
    return points.slice();
  }
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const dist = perpendicularDistance(points[i], points[first], points[last]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDist > epsilon) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify from the original points with doubling epsilon until small enough. */
function simplifyRing(points: Point[], maxVertices: number): Point[] {
  let simplified = points;
  let epsilon = 0.5;
  for (let i = 0; i < 12 && simplified.length > maxVertices; i++) {
    simplified = rdp(points, epsilon);
    epsilon *= 2;
  }
  return simplified;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Whether b lies strictly between a and c (all three collinear). */
function strictlyBetween(a: Point, b: Point, c: Point): boolean {
  return (
    (Math.min(a[0], c[0]) < b[0] && b[0] < Math.max(a[0], c[0])) ||
    (Math.min(a[1], c[1]) < b[1] && b[1] < Math.max(a[1], c[1]))
  );
}

/**
 * Whether two segments intersect beyond shared endpoints. Coordinates stay on
 * the half-integer grid (offsets are integers), so exact zero comparison is safe.
 */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    return (
      strictlyBetween(p1, p3, p2) ||
      strictlyBetween(p1, p4, p2) ||
      strictlyBetween(p3, p1, p4) ||
      strictlyBetween(p3, p2, p4)
    );
  }
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** A usable ring: at least 3 distinct vertices and no self-intersections. */
export function isSimpleRing(points: Point[]): boolean {
  const n = points.length;
  if (n < 3) {
    return false;
  }
  const seen = new Set<string>();
  for (const [x, y] of points) {
    const key = `${x},${y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        continue; // Adjacent edges share a vertex.
      }
      if (
        segmentsCross(
          points[i],
          points[(i + 1) % n],
          points[j],
          points[(j + 1) % n],
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Shoelace signed area: positive winds clockwise in y-down pixels. */
export function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/**
 * Mask path plus box offset to simplified vertex parts in resized-image
 * pixels. Keeps all parts; drops parts that simplify below 3 vertices or
 * self-intersect.
 */
export function toPolygons(
  input: PolygonInput,
  maxVertices = MAX_VERTICES_PER_PART,
): Point[][] {
  const [x1, y1] = input.box;
  const parts: Point[][] = [];
  for (const ring of parseSubpaths(input.svgPath)) {
    const offset = ring.map(([x, y]): Point => [x + x1, y + y1]);
    const simplified = simplifyRing(offset, maxVertices);
    if (isSimpleRing(simplified)) {
      parts.push(simplified);
    }
  }
  return parts;
}
