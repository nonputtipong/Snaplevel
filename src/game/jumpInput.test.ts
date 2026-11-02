import { describe, expect, test } from "bun:test";
import {
  COYOTE_MS,
  JUMP_BUFFER_MS,
  createJumpState,
  resetJump,
  updateJump,
} from "./jumpInput";

describe("jumpInput", () => {
  test("a short tap fires when grounded", () => {
    const s = createJumpState();
    const r = updateJump(s, 1000, true, true, true);
    expect(r.jump).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(["req", "apply"]);
  });

  test("buffer: press before landing fires on touchdown", () => {
    const s = createJumpState();
    const air = updateJump(s, 1000, true, false, false);
    expect(air.jump).toBe(false);
    expect(air.events.map((e) => e.type)).toEqual(["req", "deny"]);
    const land = updateJump(s, 1000 + JUMP_BUFFER_MS - 10, false, false, true);
    expect(land.jump).toBe(true);
  });

  test("buffer expires", () => {
    const s = createJumpState();
    updateJump(s, 1000, true, false, false);
    const late = updateJump(s, 1000 + JUMP_BUFFER_MS + 50, false, false, true);
    expect(late.jump).toBe(false);
  });

  test("coyote: press just after a ledge still fires", () => {
    const s = createJumpState();
    updateJump(s, 1000, false, false, true);
    const r = updateJump(s, 1000 + COYOTE_MS - 10, true, false, false);
    expect(r.jump).toBe(true);
  });

  test("past coyote, a press is denied", () => {
    const s = createJumpState();
    updateJump(s, 1000, false, false, true);
    const r = updateJump(s, 1000 + COYOTE_MS + 50, true, false, false);
    expect(r.jump).toBe(false);
    expect(r.events.at(-1)).toMatchObject({ type: "deny", grounded: false });
  });

  test("hold repeats once per landing, never mid-air", () => {
    const s = createJumpState();
    expect(updateJump(s, 1000, true, true, true).jump).toBe(true);
    // still held, airborne: no double jump
    expect(updateJump(s, 1016, false, true, false).jump).toBe(false);
    expect(updateJump(s, 1032, false, true, false).jump).toBe(false);
    // landed while held: exactly one repeat
    const repeat = updateJump(s, 1200, false, true, true);
    expect(repeat.jump).toBe(true);
    expect(repeat.events.map((e) => e.type)).toContain("repeat");
    // still held and grounded next frame: no extra jump
    expect(updateJump(s, 1216, false, true, true).jump).toBe(false);
  });

  test("release stops the repeat", () => {
    const s = createJumpState();
    updateJump(s, 1000, true, true, true);
    updateJump(s, 1016, false, false, false);
    expect(updateJump(s, 1200, false, false, true).jump).toBe(false);
  });

  test("reset clears buffer, coyote and latch", () => {
    const s = createJumpState();
    updateJump(s, 1000, true, false, false);
    resetJump(s);
    expect(updateJump(s, 1010, false, false, true).jump).toBe(false);
  });
});
