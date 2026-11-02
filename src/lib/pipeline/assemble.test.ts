import { expect, test } from "bun:test";
import {
  SPARSE_HINT,
  assembleLevel,
  dropContainedParts,
  dropUnviableParts,
  goalPlacementIssues,
  goalReachableByFlood,
  type AssembledObject,
} from "./assemble";
import type { Level, Point, Role } from "../level";
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

function assembleOk(input: Parameters<typeof assembleLevel>[0]): {
  level: Level;
  notes: string[];
} {
  const { level, notes } = assembleLevel(input);
  if (!level) {
    throw new Error("expected a winnable level");
  }
  return { level, notes };
}

const BASE = {
  image: "data:image/jpeg;base64,xx",
  width: 1000,
  height: 500,
  timings: { total: 1 },
};

test("carries roles and reasons with no fixes on a clean level", () => {
  const { level, notes } = assembleOk({
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
  const { level, notes } = assembleOk({
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
    ["stepping platform", "platform"],
  ]);
  expect(notes).toEqual([
    "Promoted e to platform.",
    "Added a ground floor.",
    "Added a generated platform so the goal stays clear of the start.",
  ]);
  expect(level.hint).toBeUndefined();
  expect(level.start).toEqual([167, 458]);
  // Step 22 contract: nothing standing meets the 200px floor (e is 42px
  // away), so a step generates at the far flooded edge instead.
  expect(level.goal).toEqual([910, 446]);
});

test("unreachable goal gains a step and a nudge with notes", () => {
  const { level, notes } = assembleOk({
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
  expect(ids).toContain("goal-step");
  // The 240px a→c gap beats the ~190px derived limit; the mid-way step still
  // strands the goal. Step 22 contract: the nudge backstop also honors the
  // 200px floor, so a step generates beside the start instead of reusing it.
  expect(level.goal).toEqual([292, 270]);
  expect(notes).toEqual([
    "Added a stepping platform to bridge a gap.",
    "Added a generated platform so the goal stays clear of the start.",
    "Goal closer than 40% of the level width.",
  ]);
});

test("single object yields ground, one step, and the sparse hint", () => {
  const { level, notes } = assembleOk({
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
  const { level, notes } = assembleOk({ ...BASE, objects: [] });
  expect(level.objects.map((o) => o.id)).toEqual(["ground", "step-0", "step-1"]);
  expect(level.hint).toBe(SPARSE_HINT);
  expect(notes).toEqual([
    "Added a ground floor.",
    "Added generated platforms for a sparse photo.",
  ]);
  expect(level.goal).toEqual([667, 344]);
});

test("blocked headroom skips to the next platform", () => {
  const { level } = assembleOk({
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

test("goal inside a solid moves to a clear spot", () => {
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("c", [square(150, 300, 100)], "platform", 4000),
      obj("d", [square(300, 300, 100)], "platform", 3000),
      obj(
        "lid",
        [
          [
            [300, 220],
            [400, 220],
            [400, 280],
            [300, 280],
          ],
        ],
        "hazard",
        100,
      ),
    ],
  });
  // d's whole top is buried in lid; the goal must leave d for c.
  // (The lid is a hazard: lethal zones block the goal just like solids.
  // c's edge slot wins: its center misses the 200px floor.)
  expect(level.goal).toEqual([233, 288]);
  expect(notes).toContain("Moved the goal to an open spot.");
});

test("roofed goal top moves to the next platform", () => {
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("c", [square(150, 300, 100)], "platform", 4000),
      obj("d", [square(300, 300, 100)], "platform", 3000),
      obj(
        "roof",
        [
          [
            [300, 260],
            [400, 260],
            [400, 274],
            [300, 274],
          ],
        ],
        "bouncy",
        100,
      ),
    ],
  });
  // d's trigger box is clear but every slot's headroom is roofed; goal leaves d.
  // (c's edge slot: its center misses the 200px floor.)
  expect(level.goal).toEqual([233, 288]);
  expect(notes).toContain("Moved the goal to an open spot.");
});

test("clustered goal gains a distance note", () => {
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("c", [square(150, 300, 100)], "platform", 4000),
      obj("d", [square(300, 300, 100)], "platform", 3000),
    ],
  });
  // Nothing is 40% of the width from the start; rightmost stands, flagged.
  expect(level.goal).toEqual([350, 288]);
  expect(notes).toEqual(["Goal closer than 40% of the level width."]);
});

test("goal prefers a far clear top over a near one", () => {
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("m", [square(400, 300, 50)], "platform", 3000),
      {
        label: "w",
        phrase: "w",
        reason: "w reason",
        role: "platform",
        area: 4000,
        polygons: [square(250, 300, 42), square(700, 300, 67)],
      },
    ],
  });
  // Near part0 is free but clustered; the far part1 top must win instead.
  expect(level.goal).toEqual([734, 288]);
  expect(notes).toEqual([]);
});

test("goal ignores decor overhead", () => {
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("d", [square(700, 420, 100)], "platform", 4000),
      obj(
        "painting",
        [
          [
            [700, 340],
            [800, 340],
            [800, 400],
            [700, 400],
          ],
        ],
        "decor",
        100,
      ),
    ],
  });
  // Decor has no bodies in the scene, so it never blocks the win zone.
  expect(level.goal).toEqual([750, 408]);
  expect(notes).toEqual(["Added a ground floor."]);
});

test("relocated goal checks its host, not the rightmost box", () => {
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("c", [square(150, 300, 100)], "platform", 4000),
      obj("d", [square(700, 300, 100)], "platform", 3000),
      obj(
        "lid",
        [
          [
            [700, 220],
            [800, 220],
            [800, 280],
            [700, 280],
          ],
        ],
        "bouncy",
        100,
      ),
    ],
  });
  // Rightmost d is blocked and unreachable, but the goal relocates to c
  // (host, one hop away), so no bridge may fire. c's edge slot meets the
  // 200px floor where its center cannot.
  expect(level.goal).toEqual([233, 288]);
  expect(notes).toEqual([
    "Moved the goal to an open spot.",
    "Goal closer than 40% of the level width.",
  ]);
});

test("fully roofed level demotes the roof and runs the strip", () => {
  const roof: Point[] = [
    [0, 0],
    [1000, 0],
    [1000, 450],
    [0, 450],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 100),
      obj("roof", [roof], "bouncy", 99999),
    ],
  });
  expect(notes).toEqual([
    "Promoted roof to platform.",
    "Added a ground floor.",
    "Simplified layout: some objects are scenery.",
  ]);
  expect(level.start).toEqual([60, 462]);
  expect(level.objects.some((o) => o.label === "roof")).toBe(false);
  expect(goalReachableByFlood(level)).toBe(true);
});

test("goalPlacementIssues passes a clean assembled level", () => {
  const { level } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)]),
      obj("b", [square(200, 300, 100)], "bouncy"),
      obj("c", [square(350, 300, 100)]),
      obj("d", [square(500, 280, 100)]),
    ],
  });
  expect(goalPlacementIssues(level)).toEqual([]);
});

test("goalPlacementIssues flags an embedded, clustered goal", () => {
  const level: Level = {
    ...BASE,
    objects: [
      {
        id: "obj-0",
        label: "d",
        phrase: "d",
        role: "platform",
        reason: "r",
        parts: [square(300, 300, 100)],
      },
      {
        id: "obj-1",
        label: "lid",
        phrase: "lid",
        role: "bouncy",
        reason: "r",
        parts: [square(330, 230, 60)],
      },
    ],
    start: [27, 282],
    goal: [350, 288],
  };
  expect(goalPlacementIssues(level)).toEqual([
    "goal trigger box or headroom is blocked",
    "goal 323px from the start, under 40% of the level width",
  ]);
});

test("goalPlacementIssues flags a goal overlapping a hazard", () => {
  const level: Level = {
    ...BASE,
    objects: [
      {
        id: "obj-0",
        label: "d",
        phrase: "d",
        role: "platform",
        reason: "r",
        parts: [square(300, 300, 100)],
      },
      {
        id: "obj-1",
        label: "spikes",
        phrase: "spikes",
        role: "hazard",
        reason: "r",
        parts: [square(330, 230, 60)],
      },
    ],
    start: [27, 282],
    goal: [350, 288],
  };
  expect(goalPlacementIssues(level)).toEqual([
    "goal trigger box or headroom is blocked",
    "goal 323px from the start, under 40% of the level width",
  ]);
});

test("goalPlacementIssues flags a clear but clustered goal", () => {
  const { level } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("c", [square(150, 300, 100)], "platform", 4000),
      obj("d", [square(300, 300, 100)], "platform", 3000),
    ],
  });
  expect(goalPlacementIssues(level)).toEqual([
    "goal 323px from the start, under 40% of the level width",
  ]);
});

test("sealed wall generates a start-side goal step", () => {
  const wall: Point[] = [
    [490, 0],
    [510, 0],
    [510, 476],
    [490, 476],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("wall", [wall], "platform", 4000),
      obj("d", [square(700, 300, 100)], "platform", 3000),
    ],
  });
  // d is box-adjacent but flood-sealed behind the wall; a generated step
  // keeps the goal on the start side instead of bridging nowhere.
  expect(level.goal).toEqual([292, 286]);
  expect(level.objects.map((o) => o.id)).toContain("goal-step");
  expect(level.objects.map((o) => o.id)).not.toContain("reach-step");
  expect(notes).toEqual([
    "Added a generated platform so the goal stays clear of the start.",
    "Goal closer than 40% of the level width.",
  ]);
});

test("sub-player slit seals via erosion", () => {
  const upper: Point[] = [
    [490, 0],
    [510, 0],
    [510, 200],
    [490, 200],
  ];
  const lower: Point[] = [
    [490, 220],
    [510, 220],
    [510, 476],
    [490, 476],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("upper", [upper], "platform", 4000),
      obj("lower", [lower], "platform", 3500),
      obj("d", [square(700, 300, 100)], "platform", 3000),
    ],
  });
  // The 20px hole fits a grid cell but not the 28px-tall player: erosion
  // seals it, so the east side is unreachable and the goal generates west.
  expect(level.goal).toEqual([292, 286]);
  expect(level.objects.map((o) => o.id)).toContain("goal-step");
  expect(level.objects.map((o) => o.id)).not.toContain("reach-step");
  expect(notes).toEqual([
    "Added a generated platform so the goal stays clear of the start.",
    "Goal closer than 40% of the level width.",
  ]);
});

test("sealed pocket generates honestly below the floor", () => {
  const wall: Point[] = [
    [200, 0],
    [220, 0],
    [220, 476],
    [200, 476],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("wall", [wall], "platform", 4000),
      obj("d", [square(700, 300, 100)], "platform", 3000),
    ],
  });
  // The pocket is narrower than the 200px floor: physics forbids the floor,
  // so the goal lands at the far edge with both notes, never across.
  expect(level.objects.map((o) => o.id)).toContain("goal-step");
  expect(level.objects.map((o) => o.id)).not.toContain("reach-step");
  expect(level.goal[0]).toBeLessThan(200);
  expect(Math.abs(level.goal[0] - level.start[0])).toBeLessThan(200);
  expect(notes).toEqual([
    "Added a generated platform so the goal stays clear of the start.",
    "Goal closer than 40% of the level width.",
  ]);
});

test("fully blocked level demotes the lid and runs the strip", () => {
  const lidA: Point[] = [
    [0, 220],
    [120, 220],
    [120, 280],
    [0, 280],
  ];
  const lidGround: Point[] = [
    [0, 400],
    [1000, 400],
    [1000, 460],
    [0, 460],
  ];
  const slab: Point[] = [
    [0, 340],
    [1000, 340],
    [1000, 375],
    [0, 375],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("lidA", [lidA], "hazard", 100),
      obj("lid", [lidGround], "hazard", 60000),
      obj("slab", [slab], "bouncy", 20000),
    ],
  });
  // Every slot is blocked and the flood is seed-only, but demoting the
  // full-width lid to scenery opens the simplified strip.
  expect(level.goal).toEqual([940, 464]);
  expect(level.start).toEqual([60, 462]);
  expect(notes).toEqual([
    "Promoted lid to platform.",
    "Added a ground floor.",
    "Simplified layout: some objects are scenery.",
  ]);
  const scenery = level.objects.find((o) => o.id === "scenery");
  expect(scenery?.parts).toHaveLength(1);
  expect(level.objects.some((o) => o.label === "lid")).toBe(false);
  expect(goalReachableByFlood(level)).toBe(true);
});

test("degenerate level falls back to a simplified strip layout", () => {
  // Fully-blocked mechanics (seed-only flood, no accepted slot) but the
  // lid stops 4px above the strip corridor, so the bottom strip runs.
  const lidA: Point[] = [
    [0, 220],
    [120, 220],
    [120, 280],
    [0, 280],
  ];
  const lidGround: Point[] = [
    [0, 400],
    [1000, 400],
    [1000, 444],
    [0, 444],
  ];
  const slab: Point[] = [
    [0, 340],
    [1000, 340],
    [1000, 375],
    [0, 375],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("lidA", [lidA], "hazard", 100),
      obj("lid", [lidGround], "hazard", 60000),
      obj("slab", [slab], "bouncy", 20000),
    ],
  });
  expect(notes).toEqual([
    "Promoted lid to platform.",
    "Added a ground floor.",
    "Simplified layout.",
  ]);
  expect(level.start).toEqual([60, 462]);
  expect(level.goal).toEqual([940, 464]);
  // The sparse ground floor already is the strip: reused, not duplicated;
  // the speculative goal-step that targeted the failed goal is dropped.
  expect(level.objects.some((o) => o.id === "simplified-ground")).toBe(false);
  expect(level.objects.some((o) => o.id === "ground")).toBe(true);
  expect(level.objects.some((o) => o.id.startsWith("goal-step"))).toBe(false);
  expect(goalReachableByFlood(level)).toBe(true);
});

test("wall-blocked strip demotes the wall and runs", () => {
  // Same degenerate layout plus a full-height wall column crossing the
  // strip: the wall demotes to scenery (the lid clears the corridor, so
  // only one demotion is needed) and the strip runs.
  const lidA: Point[] = [
    [0, 220],
    [120, 220],
    [120, 280],
    [0, 280],
  ];
  const lidGround: Point[] = [
    [0, 400],
    [1000, 400],
    [1000, 444],
    [0, 444],
  ];
  const slab: Point[] = [
    [0, 340],
    [1000, 340],
    [1000, 375],
    [0, 375],
  ];
  const wall: Point[] = [
    [490, 0],
    [510, 0],
    [510, 500],
    [490, 500],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("lidA", [lidA], "hazard", 100),
      obj("lid", [lidGround], "hazard", 60000),
      obj("slab", [slab], "bouncy", 20000),
      obj("wall", [wall], "platform", 10000),
    ],
  });
  expect(notes).toEqual([
    "Added a ground floor.",
    "Simplified layout: some objects are scenery.",
  ]);
  expect(level.start).toEqual([60, 462]);
  expect(level.goal).toEqual([940, 464]);
  const scenery = level.objects.find((o) => o.id === "scenery");
  expect(scenery?.parts).toHaveLength(1);
  expect(level.objects.some((o) => o.label === "wall")).toBe(false);
  expect(goalReachableByFlood(level)).toBe(true);
});

test("demotion opens the strip one blocking part at a time", () => {
  // Wall column (bottom-touching) plus full-width lid hanging into the
  // corridor: the wall demotes first, the lid second, then the strip runs.
  // Both sources are left part-less, so both are removed.
  const lidA: Point[] = [
    [0, 220],
    [120, 220],
    [120, 280],
    [0, 280],
  ];
  const lidGround: Point[] = [
    [0, 400],
    [1000, 400],
    [1000, 460],
    [0, 460],
  ];
  const slab: Point[] = [
    [0, 340],
    [1000, 340],
    [1000, 375],
    [0, 375],
  ];
  const wall: Point[] = [
    [490, 0],
    [510, 0],
    [510, 500],
    [490, 500],
  ];
  const { level, notes } = assembleOk({
    ...BASE,
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("lidA", [lidA], "hazard", 100),
      obj("lid", [lidGround], "hazard", 60000),
      obj("slab", [slab], "bouncy", 20000),
      obj("wall", [wall], "platform", 10000),
    ],
  });
  expect(notes).toEqual([
    "Added a ground floor.",
    "Simplified layout: some objects are scenery.",
  ]);
  expect(level.start).toEqual([60, 462]);
  expect(level.goal).toEqual([940, 464]);
  const scenery = level.objects.find((o) => o.id === "scenery");
  expect(scenery?.role).toBe("decor");
  expect(scenery?.parts).toHaveLength(2);
  expect(level.objects.some((o) => o.label === "wall")).toBe(false);
  expect(level.objects.some((o) => o.label === "lid")).toBe(false);
  expect(goalReachableByFlood(level)).toBe(true);
});

test("demotion opens the strip at portrait dimensions", () => {
  // HomeDesk geometry (768x1024): the strip-top row's cell centers sit 3px
  // below the body's true center, so a cell-identity strip check dips into
  // the strip's own erosion band and wrongly reports blocked. The overlap
  // query must see the open corridor after the lid demotes.
  const lid: Point[] = [
    [0, 400],
    [768, 400],
    [768, 960],
    [0, 960],
  ];
  const { level, notes } = assembleOk({
    image: "data:image/jpeg;base64,xx",
    width: 768,
    height: 1024,
    timings: { total: 1 },
    objects: [
      obj("a", [square(10, 300, 100)], "platform", 5000),
      obj("lidA", [[[0, 220], [120, 220], [120, 280], [0, 280]]], "hazard", 100),
      obj("lid", [lid], "hazard", 60000),
      obj("slab", [[[0, 340], [768, 340], [768, 375], [0, 375]]], "bouncy", 20000),
    ],
  });
  expect(notes).toEqual([
    "Promoted lid to platform.",
    "Added a ground floor.",
    "Simplified layout: some objects are scenery.",
  ]);
  expect(level.start).toEqual([60, 977]);
  expect(level.goal).toEqual([708, 982]);
  expect(goalReachableByFlood(level)).toBe(true);
});

test("goalReachableByFlood splits sealed from open levels", () => {
  const floor: Point[] = [
    [0, 476],
    [1000, 476],
    [1000, 500],
    [0, 500],
  ];
  const wall: Point[] = [
    [490, 0],
    [510, 0],
    [510, 476],
    [490, 476],
  ];
  const make = (parts: Point[][]): Level => ({
    ...BASE,
    objects: parts.map((part, i) => ({
      id: `obj-${i}`,
      label: `o${i}`,
      phrase: `o${i}`,
      role: "platform" as Role,
      reason: "r",
      parts: [part],
    })),
    start: [56, 458],
    goal: [944, 464],
  });
  expect(goalReachableByFlood(make([floor, wall]))).toBe(false);
  expect(goalReachableByFlood(make([floor]))).toBe(true);
});

test("goal rect past the level edge does not wrap to the far edge", () => {
  const floor: Point[] = [
    [0, 476],
    [1000, 476],
    [1000, 500],
    [0, 500],
  ];
  const wall: Point[] = [
    [490, 0],
    [510, 0],
    [510, 476],
    [490, 476],
  ];
  // Goal body rect extends past x=1000; unclamped grid indices alias the
  // flooded west edge and report a sealed goal reachable (L3 false open).
  const level: Level = {
    ...BASE,
    objects: [floor, wall].map((part, i) => ({
      id: `obj-${i}`,
      label: `o${i}`,
      phrase: `o${i}`,
      role: "platform" as Role,
      reason: "r",
      parts: [part],
    })),
    start: [56, 458],
    goal: [990, 464],
  };
  expect(goalReachableByFlood(level)).toBe(false);
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
  const { level } = assembleOk({
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
