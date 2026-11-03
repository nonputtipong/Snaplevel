/** Pure stuck-rescue decision and free-spot search (no Phaser imports). */

export interface RescueSample {
  /** Player center is inside a non-sensor solid. */
  embedded: boolean;
  /** Touching at least one solid right now. */
  hasContact: boolean;
  /** Above the fall-respawn line (below it, respawn owns recovery). */
  aboveKillLine: boolean;
  /** Scene clock (ms) for the post-rescue cooldown. */
  now: number;
}

export interface RescueState {
  airFrames: number;
  embedFrames: number;
  cooldownUntil: number;
}

export function createRescueState(): RescueState {
  return { airFrames: 0, embedFrames: 0, cooldownUntil: 0 };
}

const AIR_FRAME_LIMIT = 180;
/** Consecutive embedded frames before teleporting; briefer embeds bonk. */
const EMBED_FRAME_LIMIT = 10;
/** No rescue within this long after a rescue fire. */
const RESCUE_COOLDOWN_MS = 500;

export interface RescueDecision {
  state: RescueState;
  rescue: boolean;
  /** Embedded but inside the grace window: zero upward velocity only. */
  bonk: boolean;
}

export function nextRescueState(
  prev: RescueState,
  sample: RescueSample,
): RescueDecision {
  const embedFrames = sample.embedded ? prev.embedFrames + 1 : 0;
  const airFrames = sample.hasContact ? 0 : prev.airFrames + 1;
  const idle: RescueState = {
    airFrames,
    embedFrames,
    cooldownUntil: prev.cooldownUntil,
  };
  if (!sample.aboveKillLine || sample.now < prev.cooldownUntil) {
    return { state: idle, rescue: false, bonk: false };
  }
  if (sample.embedded && embedFrames >= EMBED_FRAME_LIMIT) {
    return {
      state: {
        airFrames: 0,
        embedFrames: 0,
        cooldownUntil: sample.now + RESCUE_COOLDOWN_MS,
      },
      rescue: true,
      bonk: false,
    };
  }
  if (airFrames >= AIR_FRAME_LIMIT) {
    return {
      state: {
        airFrames: 0,
        embedFrames: 0,
        cooldownUntil: sample.now + RESCUE_COOLDOWN_MS,
      },
      rescue: true,
      bonk: false,
    };
  }
  return { state: idle, rescue: false, bonk: sample.embedded };
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
