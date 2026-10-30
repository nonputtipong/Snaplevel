import { describe, expect, test } from "bun:test";
import { getBuildOutcome, splitSSEEvents } from "./buildClient";
import { validateLevel } from "./level";
import level1 from "../../fixtures/level-1.json";
import levelEmpty from "../../fixtures/level-empty.json";

describe("splitSSEEvents", () => {
  test("splits frames and keeps the partial tail", () => {
    const [frames, rest] = splitSSEEvents(
      'event: progress\ndata: {"step":"find_objects"}\n\n' +
        'event: progress\ndata: {"step":"seg',
    );
    expect(frames).toEqual([
      { event: "progress", data: '{"step":"find_objects"}' },
    ]);
    expect(rest).toBe('event: progress\ndata: {"step":"seg');
  });

  test("joins multi-line data", () => {
    const [frames, rest] = splitSSEEvents(
      "event: complete\ndata: {\"a\":1}\ndata: {\"b\":2}\n\n",
    );
    expect(frames).toEqual([
      { event: "complete", data: '{"a":1}\n{"b":2}' },
    ]);
    expect(rest).toBe("");
  });
});

describe("getBuildOutcome", () => {
  test("ok for a level with objects", () => {
    const result = validateLevel(level1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getBuildOutcome(result.level)).toBe("ok");
    }
  });

  test("empty for the zero-object fixture", () => {
    const result = validateLevel(levelEmpty);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getBuildOutcome(result.level)).toBe("empty");
    }
  });
});
