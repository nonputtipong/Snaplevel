import { expect, test } from "bun:test";
import type { SegmentationMaskRecord } from "@meta-sam/parser";
import { decodeMaskToSVGPath } from "@meta-sam/parser";
import recordJson from "../../../fixtures/sam-mask-record.json";
import basketJson from "../../../fixtures/mask-fruit-basket.json";
import benchJson from "../../../fixtures/mask-park-bench.json";
import laptopJson from "../../../fixtures/mask-laptop.json";
import {
  isSimpleRing,
  signedArea,
  toPolygons,
  type PolygonInput,
} from "./toPolygons";

interface MaskFixture {
  imageWidth: number;
  imageHeight: number;
  box: [number, number, number, number];
  area: number;
  svgPath: string;
}

/** Ray-casting point-in-polygon for classifying hole loops in tests. */
function containsPoint(ring: [number, number][], [x, y]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Outer-loop area minus contained-hole area (holes share the outer winding). */
function netArea(parts: [number, number][][]): number {
  let net = 0;
  for (const part of parts) {
    const area = Math.abs(signedArea(part));
    const isHole = parts.some(
      (other) => other !== part && containsPoint(other, part[0]),
    );
    net += isHole ? -area : area;
  }
  return net;
}

const rec = recordJson as unknown as SegmentationMaskRecord;
const realInput: PolygonInput = {
  svgPath: decodeMaskToSVGPath(rec.mask),
  box: [rec.bounds.left, rec.bounds.top, rec.bounds.right, rec.bounds.bottom],
};

function bounds(parts: [number, number][][]): [number, number, number, number] {
  const xs = parts.flat().map(([x]) => x);
  const ys = parts.flat().map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

test("known path converts to the expected bounds and vertex count", () => {
  const parts = toPolygons(realInput);
  expect(parts).toHaveLength(1);
  // Traced boundaries sit on pixel corners (half-integers), so the ring spans
  // just past the [60,300,361,421] pixel box on the kept sides.
  expect(bounds(parts)).toEqual([59.5, 300, 360, 420.5]);
  expect(parts[0].length).toBe(7);
  expect(parts[0].length).toBeLessThanOrEqual(40);
  // Simplified polygon keeps 99.85% of the mask area (36080 px).
  expect(Math.round(signedArea(parts[0]))).toBe(36026);
});

test("multi-part paths keep all parts with the box offset applied", () => {
  const parts = toPolygons({
    svgPath: "M0 0L10 0L10 10L0 10ZM20 20L30 20L30 30L20 30Z",
    box: [100, 200, 300, 400],
  });
  expect(parts).toHaveLength(2);
  expect(parts[0][0]).toEqual([100, 200]);
  expect(parts[1][2]).toEqual([130, 230]);
});

test("empty and garbage inputs yield no parts", () => {
  expect(toPolygons({ svgPath: "", box: [0, 0, 10, 10] })).toEqual([]);
  expect(toPolygons({ svgPath: "   ", box: [0, 0, 10, 10] })).toEqual([]);
  expect(toPolygons({ svgPath: "M", box: [0, 0, 10, 10] })).toEqual([]);
});

test("parts that simplify below 3 vertices are dropped", () => {
  const collapsed = "M5 5" + "L5 5".repeat(50) + "Z";
  expect(toPolygons({ svgPath: collapsed, box: [0, 0, 10, 10] })).toEqual([]);
});

test("self-intersecting parts are dropped", () => {
  const bowtie = "M0 0L10 10L10 0L0 10Z";
  expect(toPolygons({ svgPath: bowtie, box: [0, 0, 10, 10] })).toEqual([]);
});

test("a simple square survives", () => {
  const parts = toPolygons({ svgPath: "M0 0L10 0L10 10L0 10Z", box: [0, 0, 10, 10] });
  expect(parts).toHaveLength(1);
  expect(parts[0]).toHaveLength(4);
});

test("output winds clockwise like the game fixtures", () => {
  expect(signedArea(toPolygons(realInput)[0]) > 0).toBe(true);
  const square = toPolygons({ svgPath: "M0 0L10 0L10 10L0 10Z", box: [0, 0, 10, 10] })[0];
  expect(signedArea(square)).toBe(100);
});

const CAPTURES: Array<[string, MaskFixture]> = [
  ["laptop", laptopJson as unknown as MaskFixture],
  ["fruit-basket", basketJson as unknown as MaskFixture],
  ["park-bench", benchJson as unknown as MaskFixture],
];

for (const [name, capture] of CAPTURES) {
  test(`captured ${name} mask converts to capped clockwise parts`, () => {
    const parts = toPolygons({ svgPath: capture.svgPath, box: capture.box });
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.length).toBeGreaterThanOrEqual(3);
      expect(part.length).toBeLessThanOrEqual(40);
      expect(signedArea(part) > 0).toBe(true);
    }
    // Simplification keeps the mask area within 2% after hole correction.
    const deviation = Math.abs(netArea(parts) - capture.area) / capture.area;
    expect(deviation).toBeLessThan(0.02);
  });
}

test("isSimpleRing rejects degenerate rings", () => {
  expect(isSimpleRing([[0, 0], [10, 10]])).toBe(false); // < 3 vertices
  expect(isSimpleRing([[0, 0], [10, 0], [10, 10], [0, 0]])).toBe(false); // repeated vertex
  expect(isSimpleRing([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false); // bowtie
  expect(
    isSimpleRing([[0, 0], [10, 0], [20, 0], [5, 0], [-5, 0]]),
  ).toBe(false); // collinear overlap
  expect(isSimpleRing([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
});
