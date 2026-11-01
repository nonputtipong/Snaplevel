import { expect, test } from "bun:test";
import {
  queueJump,
  releaseTouch,
  takeQueuedJump,
  touchInput,
} from "./touchInput";

test("a queued jump is taken exactly once", () => {
  releaseTouch();
  expect(takeQueuedJump()).toBe(false);
  queueJump();
  expect(takeQueuedJump()).toBe(true);
  expect(takeQueuedJump()).toBe(false);
});

test("holding jump does not queue repeats", () => {
  releaseTouch();
  queueJump();
  queueJump();
  expect(takeQueuedJump()).toBe(true);
  expect(takeQueuedJump()).toBe(false);
});

test("releaseTouch clears held flags and the queued jump", () => {
  touchInput.left = true;
  touchInput.right = true;
  queueJump();
  releaseTouch();
  expect(touchInput.left).toBe(false);
  expect(touchInput.right).toBe(false);
  expect(touchInput.jumpQueued).toBe(false);
  expect(takeQueuedJump()).toBe(false);
});
