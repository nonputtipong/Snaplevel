import { expect, test } from "bun:test";
import { isSfxEnabled, playSfx, setSfxEnabled } from "./sfx";

test("sound defaults to off", () => {
  setSfxEnabled(false);
  expect(isSfxEnabled()).toBe(false);
});

test("the toggle flips the flag both ways", () => {
  setSfxEnabled(true);
  expect(isSfxEnabled()).toBe(true);
  setSfxEnabled(false);
  expect(isSfxEnabled()).toBe(false);
});

test("playing while disabled never throws", () => {
  setSfxEnabled(false);
  for (const name of ["jump", "bounce", "respawn", "win"] as const) {
    playSfx(name);
  }
});

test("playing while enabled without audio hardware never throws", () => {
  setSfxEnabled(true);
  for (const name of ["jump", "bounce", "respawn", "win"] as const) {
    playSfx(name);
  }
  setSfxEnabled(false);
});
