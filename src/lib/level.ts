// Level JSON contract: a photo-derived game level in resized-image pixels.

export type Role = "platform" | "bouncy" | "slippery" | "hazard" | "decor";

export type Point = [number, number];

export interface LevelObject {
  id: string;
  label: string;
  phrase: string;
  role: Role;
  reason: string;
  parts: Point[][];
}

export interface Level {
  width: number;
  height: number;
  image: string;
  objects: LevelObject[];
  start: Point;
  goal: Point;
  style?: string;
  restyledImage?: string;
  timings?: Record<string, number>;
  hint?: string;
}

export type ValidationResult =
  | { ok: true; level: Level }
  | { ok: false; errors: string[] };

const ROLES: Role[] = ["platform", "bouncy", "slippery", "hazard", "decor"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

export function validateLevel(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["level must be an object"] };
  }

  if (
    typeof value.width !== "number" ||
    !Number.isFinite(value.width) ||
    value.width <= 0
  ) {
    errors.push("width must be a positive finite number");
  }
  if (
    typeof value.height !== "number" ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  ) {
    errors.push("height must be a positive finite number");
  }
  if (typeof value.image !== "string" || value.image.length === 0) {
    errors.push("image must be a non-empty string");
  }
  if (!isPoint(value.start)) {
    errors.push("start must be a [x, y] point of finite numbers");
  }
  if (!isPoint(value.goal)) {
    errors.push("goal must be a [x, y] point of finite numbers");
  }

  if (!Array.isArray(value.objects)) {
    errors.push("objects must be an array");
  } else {
    value.objects.forEach((object, index) => {
      const at = `objects[${index}]`;
      if (!isRecord(object)) {
        errors.push(`${at} must be an object`);
        return;
      }
      for (const key of ["id", "label", "phrase", "reason"]) {
        if (
          typeof object[key] !== "string" ||
          (object[key] as string).length === 0
        ) {
          errors.push(`${at}.${key} must be a non-empty string`);
        }
      }
      if (typeof object.role !== "string" || !ROLES.includes(object.role as Role)) {
        errors.push(`${at}.role must be one of ${ROLES.join("|")}`);
      }
      if (!Array.isArray(object.parts) || object.parts.length === 0) {
        errors.push(`${at}.parts must be a non-empty array`);
      } else {
        object.parts.forEach((part, partIndex) => {
          if (!Array.isArray(part) || part.length < 3) {
            errors.push(`${at}.parts[${partIndex}] must have at least 3 points`);
          } else if (!part.every(isPoint)) {
            errors.push(
              `${at}.parts[${partIndex}] must contain only finite [x, y] points`,
            );
          }
        });
      }
    });
  }

  if (value.style !== undefined && typeof value.style !== "string") {
    errors.push("style must be a string");
  }
  if (
    value.restyledImage !== undefined &&
    typeof value.restyledImage !== "string"
  ) {
    errors.push("restyledImage must be a string");
  }
  if (value.hint !== undefined && typeof value.hint !== "string") {
    errors.push("hint must be a string");
  }
  if (value.timings !== undefined) {
    const timings = value.timings;
    if (
      !isRecord(timings) ||
      !Object.values(timings).every(
        (timing) => typeof timing === "number" && Number.isFinite(timing),
      )
    ) {
      errors.push("timings must map names to finite numbers");
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, level: value as unknown as Level };
}
