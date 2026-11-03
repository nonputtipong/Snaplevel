import { expect, test } from "bun:test";
import { groundContactLabel } from "./contacts";

test("player-vs-solid resolves in either order", () => {
  expect(groundContactLabel("player", "solid:pot")).toBe("solid:pot");
  expect(groundContactLabel("solid:pot", "player")).toBe("solid:pot");
});

test("hazard, goal, and sensor pairs are not ground", () => {
  expect(groundContactLabel("player", "hazard:spikes")).toBeNull();
  expect(groundContactLabel("player", "goal")).toBeNull();
  expect(groundContactLabel("player", "sl-player")).toBeNull();
});

test("pairs without the player are not ground", () => {
  expect(groundContactLabel("solid:a", "solid:b")).toBeNull();
  expect(groundContactLabel(undefined, "solid:a")).toBeNull();
  expect(groundContactLabel("player", undefined)).toBeNull();
  expect(groundContactLabel(undefined, undefined)).toBeNull();
});
