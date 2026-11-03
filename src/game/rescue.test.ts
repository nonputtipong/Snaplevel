import { expect, test } from "bun:test";
import {
  createRescueState,
  emitRescue,
  emitRescueEnd,
  findFreeSpot,
  nextRescueState,
  onRescue,
  onRescueEnd,
  pointInPolygon,
  type RescueSample,
} from "./rescue";

function sample(over: Partial<RescueSample> = {}): RescueSample {
  return {
    embedded: false,
    hasContact: true,
    aboveKillLine: true,
    now: 0,
    ...over,
  };
}

test("holding against a wall for 5 s never rescues", () => {
  let state = createRescueState();
  for (let frame = 0; frame < 300; frame += 1) {
    const next = nextRescueState(state, sample({ now: frame * 16 }));
    expect(next.rescue).toBe(false);
    expect(next.bonk).toBe(false);
    state = next.state;
  }
  expect(state.airFrames).toBe(0);
});

test("an embedded spawn bonks first, then rescues", () => {
  let state = createRescueState();
  for (let frame = 0; frame < 9; frame += 1) {
    const next = nextRescueState(
      state,
      sample({ embedded: true, now: frame * 16 }),
    );
    expect(next.rescue).toBe(false);
    expect(next.bonk).toBe(true);
    state = next.state;
  }
  const tenth = nextRescueState(state, sample({ embedded: true, now: 160 }));
  expect(tenth.rescue).toBe(true);
  expect(tenth.bonk).toBe(false);
});

test("a brief embed never teleports", () => {
  let state = createRescueState();
  for (let frame = 0; frame < 5; frame += 1) {
    state = nextRescueState(state, sample({ embedded: true, now: frame * 16 })).state;
  }
  const next = nextRescueState(state, sample({ now: 100 }));
  expect(next.rescue).toBe(false);
  expect(next.bonk).toBe(false);
});

test("cooldown blocks a rescue right after a rescue", () => {
  let state = createRescueState();
  for (let frame = 0; frame < 9; frame += 1) {
    state = nextRescueState(
      state,
      sample({ embedded: true, now: frame * 16 }),
    ).state;
  }
  const fired = nextRescueState(state, sample({ embedded: true, now: 144 }));
  expect(fired.rescue).toBe(true);
  const again = nextRescueState(
    fired.state,
    sample({ embedded: true, now: 200 }),
  );
  expect(again.rescue).toBe(false);
});

test("180 frames with no solid contact rescues", () => {
  let state = createRescueState();
  let rescuedAt = -1;
  for (let frame = 0; frame < 300; frame += 1) {
    const next = nextRescueState(
      state,
      sample({ hasContact: false, now: frame * 16 }),
    );
    if (next.rescue && rescuedAt < 0) {
      rescuedAt = frame;
    }
    state = next.state;
  }
  expect(rescuedAt).toBe(179);
});

test("contact resets the air counter", () => {
  let state = createRescueState();
  for (let frame = 0; frame < 100; frame += 1) {
    state = nextRescueState(
      state,
      sample({ hasContact: false, now: frame * 16 }),
    ).state;
  }
  state = nextRescueState(state, sample({ now: 1600 })).state;
  expect(state.airFrames).toBe(0);
});

test("below the kill line the fall respawn owns recovery, not rescue", () => {
  const next = nextRescueState(
    { airFrames: 999, embedFrames: 999, cooldownUntil: 0 },
    sample({ hasContact: false, aboveKillLine: false }),
  );
  expect(next.rescue).toBe(false);
});

test("rescue listeners receive fire and end until unsubscribed", () => {
  const seen: string[] = [];
  const offFire = onRescue((info) => {
    seen.push(`fire#${info.streak}`);
  });
  const offEnd = onRescueEnd(() => {
    seen.push("end");
  });
  const info = { at: 1, x: 2, y: 3, parts: ["a"], streak: 1 };
  emitRescue(info);
  emitRescueEnd(info);
  offFire();
  offEnd();
  emitRescue({ ...info, at: 2, streak: 2 });
  expect(seen).toEqual(["fire#1", "end"]);
});

test("findFreeSpot returns the start when it is free", () => {
  expect(findFreeSpot(10, 20, () => false)).toEqual({ x: 10, y: 20 });
});

test("findFreeSpot climbs the ring until a free point", () => {
  const taken = (x: number, y: number) => y > 50;
  expect(findFreeSpot(0, 100, taken)).toEqual({ x: 0, y: 20 });
});

test("findFreeSpot gives up when the whole ring is taken", () => {
  expect(findFreeSpot(0, 100, () => true)).toBeNull();
});

test("pointInPolygon finds inside, outside, and concave bites", () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  expect(pointInPolygon(square, 5, 5)).toBe(true);
  expect(pointInPolygon(square, 15, 5)).toBe(false);
  const bite: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [6, 10],
    [6, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  expect(pointInPolygon(bite, 5, 8)).toBe(false);
  expect(pointInPolygon(bite, 2, 8)).toBe(true);
});
