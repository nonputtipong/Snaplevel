/** Pure per-frame input resolution, so the move/jump independence the scene
 * relies on is unit-testable without Phaser. */

export interface FrameInput {
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  grounded: boolean;
}

export interface FrameResolution {
  /** -1 left, 0 none, +1 right. Left wins when both are held. */
  vx: -1 | 0 | 1;
  jump: boolean;
}

export function resolveFrameInput(input: FrameInput): FrameResolution {
  return {
    vx: input.moveLeft ? -1 : input.moveRight ? 1 : 0,
    jump: input.jump && input.grounded,
  };
}
