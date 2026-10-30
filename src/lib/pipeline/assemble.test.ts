import { expect, test } from "bun:test";
import { assembleLevel, type AssembledObject } from "./assemble";
import type { Point } from "../level";

function square(x: number, y: number, size: number): Point[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
}

function obj(label: string, polygons: Point[][]): AssembledObject {
  return { label, phrase: label, reason: `${label} reason`, polygons };
}

const BASE = { image: "data:image/jpeg;base64,xx", width: 1000, height: 500, timings: { total: 1 } };

test("forces every role to platform and keeps polygons", () => {
  const level = assembleLevel({
    ...BASE,
    objects: [obj("a", [square(10, 100, 50)]), obj("b", [square(800, 100, 50)])],
  });
  expect(level.objects).toHaveLength(2);
  expect(level.objects.map((o) => o.role)).toEqual(["platform", "platform"]);
  expect(level.objects[0].parts).toEqual([square(10, 100, 50)]);
  expect(level.objects[0].id).toBe("obj-0");
  expect(level.timings).toEqual({ total: 1 });
});

test("start sits above the leftmost top, goal on the rightmost top", () => {
  const level = assembleLevel({
    ...BASE,
    objects: [obj("a", [square(10, 100, 50)]), obj("b", [square(800, 200, 50)])],
  });
  // Leftmost top y=100, player height clamp(500*0.045)=28 -> max(28, 100-14-4)=82.
  expect(level.start).toEqual([35, 82]);
  // Rightmost top y=200, goal r=min*0.024=12 -> max(24, 200-12)=188.
  expect(level.goal).toEqual([825, 188]);
});

test("single object puts the goal at the floor corner", () => {
  const level = assembleLevel({ ...BASE, objects: [obj("a", [square(10, 100, 50)])] });
  expect(level.start).toEqual([35, 82]);
  expect(level.goal).toEqual([940, 440]);
});

test("zero polygons yields an empty level with floor start and goal", () => {
  const level = assembleLevel({ ...BASE, objects: [obj("a", []), obj("b", [])] });
  expect(level.objects).toEqual([]);
  expect(level.start).toEqual([100, 440]);
  expect(level.goal).toEqual([900, 440]);
});
