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

export type HoldFlag = "left" | "right";

const holders: Record<HoldFlag, Set<number>> = {
  left: new Set(),
  right: new Set(),
};

/** Mark a pointer as holding a direction button. A flag stays true while
 * any pointer holds it, so a second finger never steals the first hold. */
export function holdDown(flag: HoldFlag, pointerId: number): void {
  holders[flag].add(pointerId);
  touchInput[flag] = true;
}

/** Release one pointer. Clears only the flag that pointer owns — a jump
 * tap's up/cancel/leave must never drop a held direction. */
export function releasePointer(pointerId: number): void {
  (Object.keys(holders) as HoldFlag[]).forEach((flag) => {
    holders[flag].delete(pointerId);
    touchInput[flag] = holders[flag].size > 0;
  });
}

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
 * Release everything, including forgotten pointers. Only for global exits:
 * window blur, hidden tab, unmount, scene shutdown, and level restart.
 * Pointer up/cancel/leave must call releasePointer instead.
 */
export function releaseTouch(): void {
  holders.left.clear();
  holders.right.clear();
  touchInput.left = false;
  touchInput.right = false;
  touchInput.jumpQueued = false;
}
