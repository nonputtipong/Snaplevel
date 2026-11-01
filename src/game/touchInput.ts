/**
 * Shared touch state: the React buttons write, the scene polls once per
 * frame. Module singleton on purpose (one game instance at a time), so the
 * scene needs no constructor changes.
 */
export const touchInput = {
  left: false,
  right: false,
  jumpQueued: false,
};

/** Queue one jump; the scene consumes it on its next frame, so even a tap
 * shorter than one frame lands. Holding the button does not repeat. */
export function queueJump(): void {
  touchInput.jumpQueued = true;
}

/** Take a queued jump if present. The scene calls this once per frame. */
export function takeQueuedJump(): boolean {
  if (!touchInput.jumpQueued) {
    return false;
  }
  touchInput.jumpQueued = false;
  return true;
}

/**
 * Release everything. Called on pointercancel/leave, window blur, hidden
 * tab, scene destroy, and level restart, so no button can stay stuck.
 */
export function releaseTouch(): void {
  touchInput.left = false;
  touchInput.right = false;
  touchInput.jumpQueued = false;
}
