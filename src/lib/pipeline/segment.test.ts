import { expect, test } from "bun:test";
import type { SegmentationMaskRecord } from "@meta-sam/parser";
import recordJson from "../../../fixtures/sam-mask-record.json";
import { buildMatches, selectKeptMatch, type MaskMatch } from "./segment";

const realMask = recordJson as unknown as SegmentationMaskRecord;
// Real captured record: synthetic 512x512 white rectangle on dark background,
// phrase "white rectangle", lossless 301x121 mask at bounds [60,300,361,421].

function clone(rec: SegmentationMaskRecord): SegmentationMaskRecord {
  return JSON.parse(JSON.stringify(rec)) as SegmentationMaskRecord;
}

function match(area: number): MaskMatch {
  return { box: [0, 0, 10, 10], svgPath: "M0 0h10v10H0Z", area };
}

test("buildMatches decodes the real captured mask", () => {
  const matches = buildMatches([realMask]);
  expect(matches).toHaveLength(1);
  expect(matches[0].box).toEqual([60, 300, 361, 421]);
  // Recalculated from the captured payload: 36080 foreground px of 301x121.
  expect(matches[0].area).toBe(36080);
  expect(matches[0].svgPath.length).toBe(7800);
  // Path coords are local to the raster (start near 0,0 — not at the box offset 60,300).
  expect(matches[0].svgPath.startsWith("M2.5 0")).toBe(true);
});

test("buildMatches maps every mask record", () => {
  const other: SegmentationMaskRecord = {
    ...clone(realMask),
    bounds: { left: 0, top: 0, right: 100, bottom: 100 },
  };
  const matches = buildMatches([realMask, other]);
  expect(matches).toHaveLength(2);
  expect(matches[0].box).toEqual([60, 300, 361, 421]);
  expect(matches[1].box).toEqual([0, 0, 100, 100]);
});

test("selectKeptMatch keeps the largest match", () => {
  expect(selectKeptMatch([match(5000), match(36080)], 512 * 512)?.area).toBe(36080);
});

test("selectKeptMatch drops masks under 1% of image area", () => {
  expect(selectKeptMatch([match(99)], 100 * 100)).toBeUndefined(); // 0.99%
});

test("selectKeptMatch keeps a mask at exactly 1%", () => {
  expect(selectKeptMatch([match(100)], 100 * 100)?.area).toBe(100);
});

test("zero matches is a valid skip", () => {
  expect(buildMatches([])).toEqual([]);
  expect(selectKeptMatch([], 512 * 512)).toBeUndefined();
});
