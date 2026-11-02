import { describe, expect, test } from "bun:test";
import { validateLevel } from "./level";
import { goalPlacementIssues, goalReachableByFlood } from "./pipeline/assemble";
import level1 from "../../fixtures/level-1.json";
import level2 from "../../fixtures/level-2.json";
import levelEmpty from "../../fixtures/level-empty.json";

describe("validateLevel", () => {
  test("accepts fixture 1", () => {
    expect(validateLevel(level1).ok).toBe(true);
  });

  test("accepts portrait fixture 2", () => {
    const result = validateLevel(level2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level.width).toBe(768);
      expect(result.level.height).toBe(1024);
    }
  });

  test("fixtures have well-placed goals", () => {
    const issues: Record<string, string[]> = {};
    const levels = [level1, level2].map((raw, i) => {
      const result = validateLevel(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`level-${i + 1} invalid`);
      }
      issues[`level-${i + 1}`] = goalPlacementIssues(result.level);
      return result.level;
    });
    // Level-2's east is genuinely sealed, so the assembler moved its goal to
    // the farthest reachable open spot (197px clears the 154px floor) with an
    // honest closer-note instead of shipping an unreachable goal.
    expect(issues).toEqual({
      "level-1": [],
      "level-2": ["goal 197px from the start, under 40% of the level width"],
    });
    // Every shipped example is bot-won and flood-open.
    expect(goalReachableByFlood(levels[0])).toBe(true);
    expect(goalReachableByFlood(levels[1])).toBe(true);
  });

  test("accepts the empty fixture", () => {
    const result = validateLevel(levelEmpty);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level.objects).toEqual([]);
    }
  });

  test("accepts an optional hint", () => {
    const withHint = structuredClone(level1) as unknown as Record<string, unknown>;
    withHint.hint = "Tip: test hint.";
    const result = validateLevel(withHint);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level.hint).toBe("Tip: test hint.");
    }
  });

  test("rejects a non-string hint", () => {
    const broken = structuredClone(level1) as unknown as Record<string, unknown>;
    broken.hint = 42;
    const result = validateLevel(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("hint must be a string");
    }
  });

  test("rejects an unknown role", () => {
    const broken = structuredClone(level1) as unknown as Record<string, unknown>;
    const objects = broken.objects as Record<string, unknown>[];
    objects[0].role = "lava";
    const result = validateLevel(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("objects[0].role");
    }
  });

  test("rejects missing parts", () => {
    const broken = structuredClone(level1) as unknown as Record<string, unknown>;
    const objects = broken.objects as Record<string, unknown>[];
    delete objects[1].parts;
    const result = validateLevel(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("objects[1].parts");
    }
  });

  test("rejects a non-numeric point", () => {
    const broken = structuredClone(level1) as unknown as Record<string, unknown>;
    const objects = broken.objects as Record<string, unknown>[];
    const parts = objects[0].parts as unknown[][];
    parts[0][0] = ["x", 0];
    const result = validateLevel(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("objects[0].parts[0]");
    }
  });

  test("rejects a missing start", () => {
    const broken = structuredClone(level1) as unknown as Record<string, unknown>;
    delete broken.start;
    const result = validateLevel(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("start");
    }
  });
});
