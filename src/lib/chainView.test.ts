import { describe, expect, test } from "bun:test";
import { cssColor, formatMs, timingRows } from "./chainView";

describe("formatMs", () => {
  test("formats milliseconds under a second", () => {
    expect(formatMs(53)).toBe("53 ms");
  });

  test("formats seconds with one decimal", () => {
    expect(formatMs(8990)).toBe("9.0 s");
  });

  test("handles bad input", () => {
    expect(formatMs(NaN)).toBe("—");
    expect(formatMs(-5)).toBe("—");
  });
});

describe("cssColor", () => {
  test("formats a debug color as hex", () => {
    expect(cssColor(0x22c55e)).toBe("#22c55e");
    expect(cssColor(0x6b7280)).toBe("#6b7280");
  });
});

describe("timingRows", () => {
  test("labels Spark, SAM and assemble in order", () => {
    const rows = timingRows({
      timings: {
        find_objects: 8990,
        segment: 7490,
        design_level: 53,
        total: 16533,
      },
    });
    expect(rows).toEqual([
      { label: "Muse Spark (vision + structure)", text: "9.0 s" },
      { label: "SAM 3.1 (masks)", text: "7.5 s" },
      { label: "Assemble level", text: "53 ms" },
      { label: "Total", text: "16.5 s" },
    ]);
  });

  test("returns no rows without timings", () => {
    expect(timingRows({})).toEqual([]);
  });
});
