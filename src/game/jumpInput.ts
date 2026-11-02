/** Pure jump-decision logic: buffer, coyote time, and hold-to-repeat. */

export const JUMP_BUFFER_MS = 100;
export const COYOTE_MS = 80;

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
  /** After a fired jump, hold-repeat needs airtime before re-arming. */
  needAir: boolean;
}

export function createJumpState(): JumpState {
  return { bufferUntil: 0, coyoteUntil: 0, needAir: false };
}

export function resetJump(state: JumpState): void {
  state.bufferUntil = 0;
  state.coyoteUntil = 0;
  state.needAir = false;
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
 * button still down. Fires on ground or coyote time; a press survives
 * JUMP_BUFFER_MS so taps just before landing are not lost; holding
 * re-fires once per landing, never mid-air.
 */
export function updateJump(
  state: JumpState,
  now: number,
  pressed: boolean,
  held: boolean,
  grounded: boolean,
): JumpResolution {
  const events: JumpEvent[] = [];
  if (grounded) {
    state.coyoteUntil = now + COYOTE_MS;
  } else {
    state.needAir = false;
  }
  if (pressed) {
    state.bufferUntil = now + JUMP_BUFFER_MS;
    events.push({ type: "req", at: now, grounded });
  }
  const fromBuffer = now <= state.bufferUntil;
  const fromHold = held && grounded && !state.needAir;
  const canJump = grounded || now <= state.coyoteUntil;
  let jump = false;
  if ((fromBuffer || fromHold) && canJump) {
    jump = true;
    state.bufferUntil = 0;
    state.needAir = true;
    events.push({
      type: !pressed && fromHold ? "repeat" : "apply",
      at: now,
      grounded,
    });
  } else if (pressed && !canJump) {
    events.push({ type: "deny", at: now, grounded, reason: "airborne" });
  }
  for (const event of events) {
    for (const listener of listeners) {
      listener(event);
    }
  }
  return { jump, events };
}
