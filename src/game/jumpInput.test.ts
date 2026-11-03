import { describe, expect, test } from "bun:test";
import {
  COYOTE_MS,
  JUMP_BUFFER_MS,
  REPEAT_GAP_MS,
  createJumpState,
  resetJump,
  updateJump,
} from "./jumpInput";

const REST = 0;
const FALLING = 250;
const RISING = -400;

describe("jumpInput", () => {
  test("a short tap fires when grounded", () => {
    const s = createJumpState();
    const r = updateJump(s, 1000, true, true, true, REST);
    expect(r.jump).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(["req", "apply"]);
  });

  test("buffer: press before landing fires on touchdown", () => {
    const s = createJumpState();
    const air = updateJump(s, 1000, true, false, false, FALLING);
    expect(air.jump).toBe(false);
    expect(air.events.map((e) => e.type)).toEqual(["req", "deny"]);
    const land = updateJump(s, 1000 + JUMP_BUFFER_MS - 10, false, false, true, REST);
    expect(land.jump).toBe(true);
  });

  test("buffer expires", () => {
    const s = createJumpState();
    updateJump(s, 1000, true, false, false, FALLING);
    const late = updateJump(s, 1000 + JUMP_BUFFER_MS + 50, false, false, true, REST);
    expect(late.jump).toBe(false);
  });

  test("coyote: press just after a ledge still fires", () => {
    const s = createJumpState();
    updateJump(s, 1000, false, false, true, REST);
    const r = updateJump(s, 1000 + COYOTE_MS - 10, true, false, false, FALLING);
    expect(r.jump).toBe(true);
  });

  test("past coyote, a press is denied", () => {
    const s = createJumpState();
    updateJump(s, 1000, false, false, true, REST);
    const r = updateJump(s, 1000 + COYOTE_MS + 50, true, false, false, FALLING);
    expect(r.jump).toBe(false);
    expect(r.events.at(-1)).toMatchObject({ type: "deny", grounded: false });
  });

  test("no mid-air double jump on a quick re-tap", () => {
    const s = createJumpState();
    expect(updateJump(s, 1000, true, true, true, REST).jump).toBe(true);
    // Rising, still inside coyote: must not fire again.
    const mid = updateJump(s, 1050, true, true, false, RISING);
    expect(mid.jump).toBe(false);
    expect(mid.events.at(-1)).toMatchObject({ type: "deny", reason: "rising" });
  });

  test("hold repeats once per landing, never mid-air", () => {
    const s = createJumpState();
    expect(updateJump(s, 1000, true, true, true, REST).jump).toBe(true);
    expect(updateJump(s, 1016, false, true, false, RISING).jump).toBe(false);
    expect(updateJump(s, 1032, false, true, false, FALLING).jump).toBe(false);
    const repeat = updateJump(s, 1200, false, true, true, REST);
    expect(repeat.jump).toBe(true);
    expect(repeat.events.map((e) => e.type)).toContain("repeat");
    // Still held and grounded next frame: gap blocks the extra jump.
    expect(updateJump(s, 1216, false, true, true, REST).jump).toBe(false);
  });

  test("missed landing edge: a jump that never leaves ground repeats anyway", () => {
    const s = createJumpState();
    expect(updateJump(s, 1000, true, true, true, REST).jump).toBe(true);
    // Head-bonk: grounded forever, vy back to rest, no airborne frame.
    expect(updateJump(s, 1100, false, true, true, REST).jump).toBe(false);
    expect(updateJump(s, 1000 + REPEAT_GAP_MS + 10, false, true, true, REST).jump).toBe(true);
  });

  test("grounded flicker at rest keeps hopping without doubles", () => {
    const s = createJumpState();
    const fires: number[] = [];
    for (let t = 0; t < 2000; t += 16) {
      const grounded = t % 64 < 48;
      if (updateJump(s, t, t === 0, true, grounded, REST).jump) {
        fires.push(t);
      }
    }
    expect(fires.length).toBeGreaterThan(3);
    for (let i = 1; i < fires.length; i++) {
      expect(fires[i] - fires[i - 1]).toBeGreaterThanOrEqual(REPEAT_GAP_MS);
    }
  });

  test("30 s simulated hold gives one jump per landing", () => {
    const s = createJumpState();
    let airLeft = 0;
    let fires = 0;
    let airFires = 0;
    for (let t = 0; t < 30000; t += 16) {
      const grounded = airLeft <= 0;
      const vy = airLeft <= 0 ? REST : airLeft > 50 ? RISING : FALLING;
      if (updateJump(s, t, t === 0, true, grounded, vy).jump) {
        fires++;
        if (!grounded) airFires++;
        airLeft = 105;
      }
      if (airLeft > 0) airLeft--;
    }
    expect(airFires).toBe(0);
    expect(fires).toBeGreaterThan(10);
    expect(fires).toBeLessThan(25);
  });

  test("release stops the repeat", () => {
    const s = createJumpState();
    updateJump(s, 1000, true, true, true, REST);
    updateJump(s, 1016, false, false, false, FALLING);
    expect(updateJump(s, 1200, false, false, true, REST).jump).toBe(false);
  });

  test("reset clears buffer, coyote and pacing", () => {
    const s = createJumpState();
    updateJump(s, 1000, true, false, false, FALLING);
    resetJump(s);
    expect(updateJump(s, 1010, false, false, true, REST).jump).toBe(false);
  });
});
