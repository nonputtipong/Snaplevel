/** Single source of truth for movement tuning (scene and assembler share it). */

export const PLAYER_SPEED = 0.0062; // × level width, px per physics step
export const PLAYER_JUMP = 0.017; // × level height, px per physics step
export const GRAVITY_Y = 1; // Matter gravity y (default scale, default loop)

export function playerSize(
  width: number,
  height: number,
): { pw: number; ph: number } {
  return {
    pw: Math.min(Math.max(width * 0.032, 20), 36),
    ph: Math.min(Math.max(height * 0.045, 28), 52),
  };
}

// --- Derived reachability limits ---
//
// Matter applies gravity as (force / mass) × dt² per step with the default
// scale 0.001 at the default 60 fps step (16.666 ms), so each step adds
//   g = GRAVITY_Y × 0.001 × 16.666² ≈ 0.278 px/step
// to the downward velocity. Jump sets an upward velocity of
//   v = PLAYER_JUMP × height px/step
// and horizontal input re-applies PLAYER_SPEED × width px/step every step
// while held, so horizontal speed stays constant through the jump.
// Projectile motion then gives:
//   nominal rise = v² / 2g = (0.017H)² / 0.556 px  (≈242 px at H = 682)
//   airtime      = 2v / g = 2(0.017H) / 0.278 steps (≈83 steps at H = 682)
//   nominal gap  = speed × airtime ≈ 0.00076 × W × H px (≈530 px at 1024×682)
// SAFETY_MARGIN halves both to cover air friction (≈0.01/step), Verlet
// integration detail, and tap (not held) input.

const STEP_MS = 16.666;
const GRAVITY_SCALE = 0.001;
const STEP_GRAVITY = GRAVITY_Y * GRAVITY_SCALE * STEP_MS * STEP_MS;
const SAFETY_MARGIN = 0.5;

/** Highest platform top reachable above the current top, in pixels. */
export function maxRisePx(height: number): number {
  const v = PLAYER_JUMP * height;
  return (SAFETY_MARGIN * v * v) / (2 * STEP_GRAVITY);
}

/** Widest horizontal gap crossable between platform edges, in pixels. */
export function maxGapPx(width: number, height: number): number {
  const airtime = (2 * PLAYER_JUMP * height) / STEP_GRAVITY;
  return SAFETY_MARGIN * PLAYER_SPEED * width * airtime;
}
