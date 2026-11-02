import type { Level } from "./level";

/** 8990 -> "9.0 s", 53 -> "53 ms". */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** 0x22c55e -> "#22c55e". */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export interface TimingRow {
  label: string;
  text: string;
}

const TIMING_LABELS: [string, string][] = [
  ["find_objects", "Muse Spark (vision + structure)"],
  ["segment", "SAM 3.1 (masks)"],
  ["design_level", "Assemble level"],
  ["total", "Total"],
];

/** Ordered timing rows; empty when the level carries no timings. */
export function timingRows(level: Pick<Level, "timings">): TimingRow[] {
  if (!level.timings) {
    return [];
  }
  const rows: TimingRow[] = [];
  for (const [key, label] of TIMING_LABELS) {
    const value = level.timings[key];
    if (typeof value === "number") {
      rows.push({ label, text: formatMs(value) });
    }
  }
  return rows;
}
