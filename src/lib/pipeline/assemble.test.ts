import { expect, test } from "bun:test";
import {
  SPARSE_HINT,
  assembleLevel,
  dropContainedParts,
  dropUnviableParts,
  type AssembledObject,
} from "./assemble";
import type { Point, Role } from "../level";
import { toPolygons } from "./toPolygons";
import basketJson from "../../../fixtures/mask-fruit-basket.json";
import benchJson from "../../../fixtures/mask-park-bench.json";
import laptopJson from "../../../fixtures/mask-laptop.json";

function square(x: number, y: number, size: number): Point[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
}

function obj(
  label: string,
  polygons: Point[][],
  role: Role = "platform",
  area = 1000,
): AssembledObject {
  return { label, phrase: label, reason: `${label} reason`, role, area, polygons };
}

const BASE = {
  image: "data:image/jpeg;base64,xx",
  width: 1000,
  height: 500,
  timings: { total: 1 },
};

test("carries roles and reasons with no fixes on a clean level", () => {
  const { level, notes } = assembleLevel({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)]),
      obj("b", [square(200, 300, 100)], "bouncy"),
      obj("c", [square(350, 300, 100)]),
      obj("d", [square(500, 280, 100)]),
    ],
  });
  expect(level.objects.map((o) => o.role)).toEqual([
    "platform",
    "bouncy",
    "platform",
    "platform",
  ]);
  expect(level.objects[1].reason).toBe("b reason");
  expect(level.objects[1].parts).toHaveLength(1);
  expect(notes).toEqual([]);
  expect(level.hint).toBeUndefined();
  expect(level.start).toEqual([27, 282]);
  expect(level.goal).toEqual([550, 268]);
});

test("promotes the largest object when platforms drop below two", () => {
  const { level, notes } = assembleLevel({
    ...BASE,
    objects: [
      obj("a", [square(10, 420, 50)], "platform", 5000),
      obj("e", [square(100, 420, 50)], "slippery", 900),
      obj("f", [square(200, 420, 50)], "bouncy", 100),
    ],
  });
  expect(level.objects.map((o) => [o.label, o.role])).toEqual([
    ["a", "platform"],
    ["e", "platform"],
    ["f", "bouncy"],
    ["ground", "platform"],
  ]);
  expect(notes).toEqual([
    "Promoted e to platform.",
    "Added a ground floor.",
  ]);
  expect(level.hint).toBeUndefined();
  expect(level.start).toEqual([167, 458]);
  // Goal targets platforms only: e (max-x 150) beats a, f is bouncy.
  expect(level.goal).toEqual([125, 408]);
});

test("unreachable goal gains a step and a nudge with notes", () => {
  const { level, notes } = assembleLevel({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("c", [square(350, 300, 100)], "platform", 4000),
      obj("d", [square(810, 100, 60)], "platform", 3000),
    ],
  });
  const ids = level.objects.map((o) => o.id);
  expect(ids).not.toContain("ground");
  expect(ids).toContain("reach-step");
  // The 240px a→c gap beats the ~190px derived limit; the mid-way step still
  // strands the goal, so it lands back on the start platform top.
  expect(level.goal).toEqual([60, 288]);
  expect(notes).toEqual([
    "Added a stepping platform to bridge a gap.",
    "Moved the goal onto a reachable platform.",
  ]);
});

test("single object yields ground, one step, and the sparse hint", () => {
  const { level, notes } = assembleLevel({
    ...BASE,
    objects: [obj("a", [square(10, 300, 100)], "bouncy", 500)],
  });
  expect(level.objects.map((o) => o.role)).toEqual([
    "platform",
    "platform",
    "platform",
  ]);
  expect(level.objects.map((o) => o.id)).toEqual(["obj-0", "ground", "step-0"]);
  expect(level.hint).toBe(SPARSE_HINT);
  expect(notes).toEqual([
    "Promoted a to platform.",
    "Added a ground floor.",
    "Added generated platforms for a sparse photo.",
  ]);
  expect(level.goal).toEqual([500, 404]);
});

test("zero objects yields ground plus two steps, never empty", () => {
  const { level, notes } = assembleLevel({ ...BASE, objects: [] });
  expect(level.objects.map((o) => o.id)).toEqual(["ground", "step-0", "step-1"]);
  expect(level.hint).toBe(SPARSE_HINT);
  expect(notes).toEqual([
    "Added a ground floor.",
    "Added generated platforms for a sparse photo.",
  ]);
  expect(level.goal).toEqual([667, 344]);
});

test("blocked headroom skips to the next platform", () => {
  const { level } = assembleLevel({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("lid", [square(10, 180, 100)], "bouncy", 100),
      obj("c", [square(150, 300, 100)], "platform", 4000),
      obj("d", [square(300, 300, 100)], "platform", 3000),
    ],
  });
  // Platform a's top is roofed by lid; start lands on c instead.
  expect(level.start).toEqual([167, 282]);
});

test("fully roofed level falls back to the floor start", () => {
  const roof: Point[] = [
    [0, 0],
    [1000, 0],
    [1000, 450],
    [0, 450],
  ];
  const { level } = assembleLevel({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 100),
      obj("roof", [roof], "bouncy", 99999),
    ],
  });
  expect(level.start).toEqual([100, 440]);
});

test("dropContainedParts keeps disjoint parts and drops holes", () => {
  const outer = square(0, 0, 100);
  const hole = square(20, 20, 10);
  const far = square(200, 200, 50);
  expect(dropContainedParts([outer, hole])).toEqual([outer]);
  expect(dropContainedParts([outer, far])).toEqual([outer, far]);
  expect(dropContainedParts([])).toEqual([]);
});

test("dropUnviableParts drops micro-slivers but keeps healthy parts", () => {
  // Real task/part shapes from a live coffee-table build: a 2x5px concave
  // stair-step sliver (area 8.5, decomposes to dust) and a 1x2px hexagon.
  const sliver: Point[] = [
    [175.5, 856], [176, 855.5], [176.5, 856], [176.5, 857], [176.5, 858],
    [177, 858.5], [177.5, 859], [177.5, 860], [177.5, 861], [177, 861.5],
    [176, 861.5], [175.5, 861], [175.5, 860], [175.5, 859], [175.5, 858],
    [175.5, 857],
  ];
  const hexagon: Point[] = [
    [170.5, 809], [171, 808.5], [171.5, 809],
    [171.5, 810], [171, 810.5], [170.5, 810],
  ];
  const healthy = square(0, 0, 100);
  const ell: Point[] = [
    [640, 300], [840, 300], [840, 340], [700, 340], [700, 560], [640, 560],
  ];
  expect(dropUnviableParts([sliver, hexagon, healthy, ell])).toEqual([
    healthy,
    ell,
  ]);
  expect(dropUnviableParts([])).toEqual([]);
});

test("assembleLevel drops objects left with no viable parts", () => {
  const sliver: Point[] = [
    [10, 10], [11, 10], [12, 10], [12, 11], [12, 12], [11, 12], [10, 12],
    [10, 11],
  ];
  const { level } = assembleLevel({
    ...BASE,
    objects: [obj("crumb", [sliver], "platform", 50), obj("floor", [square(0, 400, 200)], "platform", 40000)],
  });
  expect(level.objects.map((o) => o.label)).not.toContain("crumb");
});

test("real captures lose exactly their hole loops", () => {
  const cases = [
    ["laptop", laptopJson, 1],
    ["basket", basketJson, 1],
    ["bench", benchJson, 1],
  ] as const;
  for (const [, json, expected] of cases) {
    const rec = json as unknown as {
      box: [number, number, number, number];
      svgPath: string;
    };
    const parts = toPolygons({ svgPath: rec.svgPath, box: rec.box });
    expect(dropContainedParts(parts)).toHaveLength(expected);
  }
});
