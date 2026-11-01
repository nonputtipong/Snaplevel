import { expect, test } from "bun:test";
import {
  findFreeSpot,
  nextRescueState,
  pointInPolygon,
  type RescueSample,
} from "./rescue";

const WALL_HOLD: RescueSample = {
  embedded: false,
  hasContact: true,
  aboveKillLine: true,
};

test("holding against a wall for 5 s never rescues", () => {
  let state = { airFrames: 0 };
  for (let frame = 0; frame < 300; frame += 1) {
    const next = nextRescueState(state, WALL_HOLD);
    expect(next.rescue).toBe(false);
    state = next.state;
  }
  expect(state.airFrames).toBe(0);
});

test("an embedded spawn rescues immediately", () => {
  const next = nextRescueState(
    { airFrames: 0 },
    { embedded: true, hasContact: true, aboveKillLine: true },
  );
  expect(next.rescue).toBe(true);
});

test("180 frames with no solid contact rescues", () => {
  let state = { airFrames: 0 };
  let rescuedAt = -1;
  for (let frame = 0; frame < 300; frame += 1) {
    const next = nextRescueState(state, {
      embedded: false,
      hasContact: false,
      aboveKillLine: true,
    });
    if (next.rescue && rescuedAt < 0) {
      rescuedAt = frame;
    }
    state = next.state;
  }
  expect(rescuedAt).toBe(179);
});

test("contact resets the air counter", () => {
  let state = { airFrames: 0 };
  for (let frame = 0; frame < 100; frame += 1) {
    state = nextRescueState(state, {
      embedded: false,
      hasContact: false,
      aboveKillLine: true,
    }).state;
  }
  state = nextRescueState(state, WALL_HOLD).state;
  expect(state.airFrames).toBe(0);
});

test("below the kill line the fall respawn owns recovery, not rescue", () => {
  const next = nextRescueState(
    { airFrames: 999 },
    { embedded: false, hasContact: false, aboveKillLine: false },
  );
  expect(next.rescue).toBe(false);
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
