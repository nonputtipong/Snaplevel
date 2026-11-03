/** Pure jump-decision logic: buffer, coyote time, and hold-to-repeat. */

export const JUMP_BUFFER_MS = 100;
export const COYOTE_MS = 80;
/** Min ms between hold-repeat fires; vy at/above this is "not rising". */
export const REPEAT_GAP_MS = 150;
export const NOT_RISING_VY = -20;

export type JumpEventType = "req" | "apply" | "deny" | "repeat";

export interface JumpEvent {
  type: JumpEventType;
  /** Scene clock (ms) when the event was decided. */
  at: number;
  grounded: boolean;
  reason?: string;
}

export interface JumpState {
  bufferUntil: number;
  coyoteUntil: number;
  lastJumpAt: number;
}

export function createJumpState(): JumpState {
  return { bufferUntil: 0, coyoteUntil: 0, lastJumpAt: -REPEAT_GAP_MS };
}

export function resetJump(state: JumpState): void {
  state.bufferUntil = 0;
  state.coyoteUntil = 0;
  state.lastJumpAt = -REPEAT_GAP_MS;
}

export interface JumpResolution {
  jump: boolean;
  events: JumpEvent[];
}

/**
 * Decide this frame's jump. pressed = new press this frame, held =
 * button still down. Level-triggered: fires whenever the button is
 * down and the body is grounded (or inside coyote time) and not
 * rising, with a gap between repeats. No landing edge to miss: a
 * jump that never leaves the ground simply fires again.
 */
export function updateJump(
  state: JumpState,
  now: number,
  pressed: boolean,
  held: boolean,
  grounded: boolean,
  vy: number,
): JumpResolution {
  const events: JumpEvent[] = [];
  if (grounded) {
    state.coyoteUntil = now + COYOTE_MS;
  }
  if (pressed) {
    state.bufferUntil = now + JUMP_BUFFER_MS;
    events.push({ type: "req", at: now, grounded });
  }
  const rising = vy < NOT_RISING_VY;
  const canJump = (grounded || now <= state.coyoteUntil) && !rising;
  const gapOk = now - state.lastJumpAt >= REPEAT_GAP_MS;
  const want = now <= state.bufferUntil || held;
  let jump = false;
  if (want && canJump && gapOk) {
    jump = true;
    state.bufferUntil = 0;
    state.lastJumpAt = now;
    events.push({
      type: !pressed && held ? "repeat" : "apply",
      at: now,
      grounded,
    });
  } else if (pressed && !canJump) {
    events.push({
      type: "deny",
      at: now,
      grounded,
      reason: rising ? "rising" : "airborne",
    });
  } else if (held && grounded && !jump && rising) {
    // Bounded: only the frames where contact outlasts takeoff. Silent
    // otherwise (airborne held is normal; gap pacing is by design).
    events.push({ type: "deny", at: now, grounded, reason: "rising" });
  }
  return { jump, events };
}
