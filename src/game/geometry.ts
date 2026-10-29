import type { Point } from "@/lib/level";

/** Area-weighted centroid of a polygon ring (falls back to the mean on zero area). */
export function centroid(points: Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (area === 0) {
    const n = points.length;
    return [
      points.reduce((sum, [x]) => sum + x, 0) / n,
      points.reduce((sum, [, y]) => sum + y, 0) / n,
    ];
  }
  return [cx / (3 * area), cy / (3 * area)];
}
