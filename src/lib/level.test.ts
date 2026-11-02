import { describe, expect, test } from "bun:test";
import { validateLevel } from "./level";
import { goalPlacementIssues, goalReachableByFlood } from "./pipeline/assemble";
import level1 from "../../fixtures/level-1.json";
import level2 from "../../fixtures/level-2.json";
import level3 from "../../fixtures/level-3.json";
import levelEmpty from "../../fixtures/level-empty.json";

describe("validateLevel", () => {
  test("accepts fixture 1", () => {
    const result = validateLevel(level1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level.width).toBe(1536);
      expect(result.level.height).toBe(1024);
      expect(result.level.start).toEqual([506, 425]);
      expect(result.level.goal).toEqual([1349, 344]);
    }
  });

  test("accepts fixture 2", () => {
    const result = validateLevel(level2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level.width).toBe(1536);
      expect(result.level.height).toBe(1024);
      expect(result.level.start).toEqual([124, 443]);
      expect(result.level.goal).toEqual([1423, 613]);
    }
  });

  test("accepts fixture 3", () => {
    const result = validateLevel(level3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level.width).toBe(1536);
      expect(result.level.height).toBe(1024);
      expect(result.level.start).toEqual([86, 592]);
      expect(result.level.goal).toEqual([1411, 599]);
    }
  });

  test("fixtures have well-placed goals", () => {
    const issues: Record<string, string[]> = {};
    const levels = [level1, level2, level3].map((raw, i) => {
      const result = validateLevel(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`level-${i + 1} invalid`);
      }
      issues[`level-${i + 1}`] = goalPlacementIssues(result.level);
      return result.level;
    });
    // Level-3's goal sits on the planter tops with its trigger box
    // grazing them by ~10px; the bot wins through it (11 s, 10 jumps),
    // so the flag is disclosed here rather than hidden.
    expect(issues).toEqual({
      "level-1": [],
      "level-2": [],
      "level-3": ["goal trigger box or headroom is blocked"],
    });
    // Every shipped example is bot-won and flood-open.
    expect(goalReachableByFlood(levels[0])).toBe(true);
    expect(goalReachableByFlood(levels[1])).toBe(true);
    expect(goalReachableByFlood(levels[2])).toBe(true);
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
