import { describe, expect, test } from "bun:test";
import { validateObjectList } from "./listObjects";

const PLATFORM = { label: "desk", phrase: "desk", role: "platform", reason: "Flat and sturdy." };
const PLATFORM2 = { label: "sofa", phrase: "sofa", role: "platform", reason: "Wide and solid." };

describe("validateObjectList", () => {
  test("accepts a valid merged list", () => {
    const result = validateObjectList({
      objects: [
        PLATFORM,
        PLATFORM2,
        { label: "ball", phrase: "rubber ball", role: "bouncy", reason: "Round and elastic." },
        { label: "poster", phrase: "wall poster", role: "decor", reason: "Flat on the wall." },
      ],
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an empty list", () => {
    const result = validateObjectList({ objects: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("at least one");
    }
  });

  test("rejects more than 8 objects", () => {
    const result = validateObjectList({
      objects: Array.from({ length: 9 }, (_, i) => ({
        label: `thing${i}`,
        phrase: `thing number ${i}`,
        role: "platform",
        reason: "Solid.",
      })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("at most 8");
    }
  });

  test("rejects a missing phrase", () => {
    const result = validateObjectList({
      objects: [PLATFORM, { ...PLATFORM2, phrase: undefined }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("objects[1].phrase");
    }
  });

  test("rejects an unknown role", () => {
    const result = validateObjectList({
      objects: [PLATFORM, { ...PLATFORM2, role: "lava" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("objects[1].role");
    }
  });

  test("rejects fewer than two platforms", () => {
    const result = validateObjectList({
      objects: [
        PLATFORM,
        { label: "ball", phrase: "rubber ball", role: "bouncy", reason: "Round." },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("at least two");
    }
  });

  test("rejects too many hazards", () => {
    const hazard = (label: string) => ({
      label,
      phrase: label,
      role: "hazard",
      reason: "Dangerous.",
    });
    const result = validateObjectList({
      objects: [PLATFORM, PLATFORM2, hazard("knife"), hazard("fire")],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("20%");
    }
  });

  test("rejects an empty reason", () => {
    const result = validateObjectList({
      objects: [PLATFORM, { ...PLATFORM2, reason: "" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(";")).toContain("objects[1].reason");
    }
  });

  test("keeps a valid fallback", () => {
    const result = validateObjectList({
      objects: [
        { ...PLATFORM, fallback: "table" },
        { ...PLATFORM2, fallback: "couch" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.objects.map((o) => o.fallback)).toEqual([
        "table",
        "couch",
      ]);
    }
  });

  test("one bad fallback does not fail the photo", () => {
    const result = validateObjectList({
      objects: [
        { ...PLATFORM, fallback: "table" },
        { ...PLATFORM2, fallback: "big red couch" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.objects.map((o) => o.fallback)).toEqual([
        "table",
        null,
      ]);
    }
  });

  test("empty, same-as-phrase, and missing fallbacks degrade to null", () => {
    const result = validateObjectList({
      objects: [
        { ...PLATFORM, fallback: "" },
        { ...PLATFORM2, fallback: "Sofa" },
        {
          label: "ball",
          phrase: "rubber ball",
          role: "bouncy",
          reason: "Round.",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.objects.map((o) => o.fallback)).toEqual([
        null,
        null,
        null,
      ]);
    }
  });
});
