import type { Level, LevelObject, Point } from "../level";

export interface AssembledObject {
  label: string;
  phrase: string;
  reason: string;
  polygons: Point[][];
}

export interface AssembleInput {
  objects: AssembledObject[];
  /** Data URL of the resized photo used as the background. */
  image: string;
  width: number;
  height: number;
  timings: Record<string, number>;
}

function bbox(parts: Point[][]): [number, number, number, number] {
  const xs = parts.flat().map(([x]) => x);
  const ys = parts.flat().map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Build a playable Level from pipeline outputs. Every role is "platform" for
 * now (roles arrive in Step 12); start sits above the leftmost top, goal on
 * the rightmost top of another object, with floor-corner fallbacks.
 */
export function assembleLevel(input: AssembleInput): Level {
  const { width, height } = input;
  const objects: LevelObject[] = [];
  input.objects.forEach((obj, index) => {
    if (obj.polygons.length === 0) {
      return;
    }
    objects.push({
      id: `obj-${index}`,
      label: obj.label,
      phrase: obj.phrase,
      role: "platform",
      reason: obj.reason,
      parts: obj.polygons,
    });
  });

  let start: Point;
  let goal: Point;
  if (objects.length === 0) {
    start = [Math.round(width * 0.1), height - 60];
    goal = [Math.round(width * 0.9), height - 60];
  } else {
    const boxes = objects.map((o) => bbox(o.parts));
    let leftIdx = 0;
    boxes.forEach((box, i) => {
      if (box[0] < boxes[leftIdx][0]) {
        leftIdx = i;
      }
    });
    const leftmost = boxes[leftIdx];
    const others = boxes.filter((_, i) => i !== leftIdx);
    // Mirror the scene's spawn math (LevelScene clamps player/goal size).
    const ph = Math.min(Math.max(height * 0.045, 28), 52);
    const gr = Math.min(width, height) * 0.024;
    start = [
      Math.round((leftmost[0] + leftmost[2]) / 2),
      Math.max(Math.round(ph), Math.round(leftmost[1] - ph / 2 - 4)),
    ];
    if (others.length === 0) {
      goal = [width - 60, height - 60];
    } else {
      const rightmost = others.reduce((a, b) => (a[2] > b[2] ? a : b));
      goal = [
        Math.round((rightmost[0] + rightmost[2]) / 2),
        Math.max(Math.round(gr * 2), Math.round(rightmost[1] - gr)),
      ];
    }
  }

  return { width, height, image: input.image, objects, start, goal, timings: input.timings };
}
