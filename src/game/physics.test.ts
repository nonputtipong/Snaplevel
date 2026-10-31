import { expect, test } from "bun:test";
import { maxGapPx, maxRisePx, playerSize } from "./physics";

test("playerSize matches the scene clamps", () => {
  const { pw, ph } = playerSize(1024, 682);
  expect(pw).toBeCloseTo(32.768, 9);
  expect(ph).toBeCloseTo(30.69, 9);
  expect(playerSize(100, 100)).toEqual({ pw: 20, ph: 28 });
  expect(playerSize(4000, 4000)).toEqual({ pw: 36, ph: 52 });
});

test("derived reachability limits pin the projectile math", () => {
  // v = 0.017*682 = 11.6 px/step, g = 0.278 px/step²:
  // rise = 0.5 * 11.6² / 0.556 ≈ 121 px.
  expect(Math.round(maxRisePx(682))).toBe(121);
  // airtime = 2*11.6/0.278 ≈ 83 steps, gap = 0.5 * 6.35 * 83 ≈ 265 px.
  expect(Math.round(maxGapPx(1024, 682))).toBe(265);
  // Limits grow with level size (velocity scales, gravity is absolute).
  expect(maxRisePx(1024)).toBeGreaterThan(maxRisePx(682));
});
