/** Pure stuck-rescue decision and free-spot search (no Phaser imports). */

export interface RescueSample {
  /** Player center is inside a non-sensor solid. */
  embedded: boolean;
  /** Touching at least one solid right now. */
  hasContact: boolean;
  /** Above the fall-respawn line (below it, respawn owns recovery). */
  aboveKillLine: boolean;
}

export interface RescueState {
  airFrames: number;
}

const AIR_FRAME_LIMIT = 180;

export function nextRescueState(
  prev: RescueState,
  sample: RescueSample,
): { state: RescueState; rescue: boolean } {
  if (sample.embedded && sample.aboveKillLine) {
    return { state: { airFrames: 0 }, rescue: true };
  }
  const airFrames = sample.hasContact ? 0 : prev.airFrames + 1;
  return {
    state: { airFrames },
    rescue: airFrames >= AIR_FRAME_LIMIT && sample.aboveKillLine,
  };
}

const RING: Array<[number, number]> = [
  [0, 0],
  [0, -40],
  [-30, -40],
  [30, -40],
  [0, -80],
  [-60, -40],
  [60, -40],
  [-30, -80],
  [30, -80],
  [0, -120],
];

/** Ray-cast point-in-ring test over a polygon ring. */
export function pointInPolygon(
  ring: Array<[number, number]>,
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi !== yj && y >= Math.min(yi, yj) && y < Math.max(yi, yj)) {
      const crossX = xi + ((xj - xi) * (y - yi)) / (yj - yi);
      if (x < crossX) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Nearest candidate to (x, y) that isTaken rejects, or null when the whole
 * ring is blocked (caller falls back to a straight nudge up). */
export function findFreeSpot(
  x: number,
  y: number,
  isTaken: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  for (const [dx, dy] of RING) {
    if (!isTaken(x + dx, y + dy)) {
      return { x: x + dx, y: y + dy };
    }
  }
  return null;
}
