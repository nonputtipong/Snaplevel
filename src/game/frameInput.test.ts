import { expect, test } from "bun:test";
import { resolveFrameInput } from "./frameInput";

test("horizontal velocity is kept on the frame the jump is consumed", () => {
  expect(
    resolveFrameInput({
      moveLeft: false,
      moveRight: true,
      jump: true,
      grounded: true,
    }),
  ).toEqual({ vx: 1, jump: true });
});

test("left wins when both directions are held", () => {
  expect(
    resolveFrameInput({
      moveLeft: true,
      moveRight: true,
      jump: false,
      grounded: true,
    }),
  ).toEqual({ vx: -1, jump: false });
});

test("no jump without ground contact", () => {
  expect(
    resolveFrameInput({
      moveLeft: false,
      moveRight: false,
      jump: true,
      grounded: false,
    }),
  ).toEqual({ vx: 0, jump: false });
});
