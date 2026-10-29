import { describe, expect, test } from "bun:test";
import { centroid } from "./geometry";

describe("centroid", () => {
  test("centers a rectangle", () => {
    expect(
      centroid([
        [0, 0],
        [10, 0],
        [10, 20],
        [0, 20],
      ]),
    ).toEqual([5, 10]);
  });

  test("centers a concave L inside the shape", () => {
    // L: full 10x10 square minus the top-right 6x6 quadrant.
    const [x, y] = centroid([
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ]);
    expect(x).toBeCloseTo(3.875, 5);
    expect(y).toBeCloseTo(3.875, 5);
  });
});
