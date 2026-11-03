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

export interface JumpSnapshot {
  at: number;
  grounded: boolean;
  vy: number;
  held: boolean;
  /** True when a held repeat would fire right now. */
  armed: boolean;
  bufferMs: number;
  coyoteMs: number;
  y: number;
  sleeping: boolean;
}

export interface JumpInfo {
  y?: number;
  sleeping?: boolean;
}

let snapshot: JumpSnapshot | null = null;

/** Latest per-frame inputs, for the branch-only input logger. */
export function jumpSnapshot(): JumpSnapshot | null {
  return snapshot;
}

type JumpListener = (event: JumpEvent) => void;

const listeners = new Set<JumpListener>();

/** Branch-debug hook for the input logger; nothing else subscribes. */
export function onJumpEvent(listener: JumpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  info: JumpInfo = {},
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
  snapshot = {
    at: now,
    grounded,
    vy: Math.round(vy),
    held,
    armed: held && canJump && gapOk,
    bufferMs: Math.max(0, Math.round(state.bufferUntil - now)),
    coyoteMs: Math.max(0, Math.round(state.coyoteUntil - now)),
    y: Math.round(info.y ?? 0),
    sleeping: info.sleeping ?? false,
  };
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
  for (const event of events) {
    for (const listener of listeners) {
      listener(event);
    }
  }
  return { jump, events };
}
