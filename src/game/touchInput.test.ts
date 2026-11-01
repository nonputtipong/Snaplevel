import { expect, test } from "bun:test";
import {
  holdDown,
  queueJump,
  releasePointer,
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

test("a jump tap while holding right keeps right held and jumps once", () => {
  releaseTouch();
  holdDown("right", 1);
  expect(touchInput.right).toBe(true);
  queueJump();
  releasePointer(2);
  expect(touchInput.right).toBe(true);
  expect(takeQueuedJump()).toBe(true);
  expect(takeQueuedJump()).toBe(false);
  releasePointer(1);
  expect(touchInput.right).toBe(false);
});

test("jump pointerup followed by pointerleave still keeps right held", () => {
  releaseTouch();
  holdDown("right", 1);
  queueJump();
  releasePointer(2);
  releasePointer(2);
  expect(touchInput.right).toBe(true);
  expect(touchInput.left).toBe(false);
  releasePointer(1);
  expect(touchInput.right).toBe(false);
});

test("a release clears only the flag its pointer owns", () => {
  releaseTouch();
  holdDown("left", 1);
  holdDown("right", 2);
  releasePointer(1);
  expect(touchInput.left).toBe(false);
  expect(touchInput.right).toBe(true);
  releasePointer(2);
  expect(touchInput.right).toBe(false);
});

test("releaseTouch also forgets held pointers", () => {
  releaseTouch();
  holdDown("right", 1);
  releaseTouch();
  releasePointer(1);
  expect(touchInput.right).toBe(false);
});
