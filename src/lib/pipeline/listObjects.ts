import type { Role } from "../level";
import { SPARK_MODEL, getMetaClient } from "../meta";

export interface ListedObject {
  label: string;
  phrase: string;
  role: Role;
  reason: string;
}

export interface ObjectList {
  objects: ListedObject[];
}

export type ObjectListResult =
  | { ok: true; list: ObjectList }
  | { ok: false; errors: string[] };

export const MAX_OBJECTS = 8;
const ROLES: Role[] = ["platform", "bouncy", "slippery", "hazard", "decor"];

export function validateObjectList(value: unknown): ObjectListResult {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["output must be an object"] };
  }
  const objects = (value as { objects?: unknown }).objects;
  if (!Array.isArray(objects)) {
    return { ok: false, errors: ["objects must be an array"] };
  }
  if (objects.length === 0) {
    errors.push("objects must contain at least one object");
  }
  if (objects.length > MAX_OBJECTS) {
    errors.push(`objects must contain at most ${MAX_OBJECTS} objects`);
  }
  let platforms = 0;
  let hazards = 0;
  objects.forEach((object, index) => {
    const at = `objects[${index}]`;
    if (typeof object !== "object" || object === null || Array.isArray(object)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const entry = object as {
      label?: unknown;
      phrase?: unknown;
      role?: unknown;
      reason?: unknown;
    };
    if (typeof entry.label !== "string" || entry.label.length === 0) {
      errors.push(`${at}.label must be a non-empty string`);
    }
    if (typeof entry.phrase !== "string" || entry.phrase.length === 0) {
      errors.push(`${at}.phrase must be a non-empty string`);
    }
    if (typeof entry.role !== "string" || !ROLES.includes(entry.role as Role)) {
      errors.push(`${at}.role must be one of ${ROLES.join("|")}`);
    } else {
      if (entry.role === "platform") {
        platforms += 1;
      }
      if (entry.role === "hazard") {
        hazards += 1;
      }
    }
    if (typeof entry.reason !== "string" || entry.reason.length === 0) {
      errors.push(`${at}.reason must be a non-empty string`);
    }
  });
  if (objects.length > 0 && platforms < 2) {
    errors.push("at least two objects must be platforms");
  }
  if (hazards * 5 > objects.length) {
    errors.push("hazards must be at most 20% of objects");
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, list: value as unknown as ObjectList };
}

const PROMPT =
  "Look at this photo. List up to 8 large, distinct, solid objects a game character could stand on or bounce off. " +
  "Prefer big furniture-like things. For each object give a short label, a concrete noun phrase WITHOUT color adjectives " +
  "(generic words like 'mug' or 'sofa'), a game role, and a one-sentence reason. " +
  "Roles: platform (solid ground), bouncy (round, elastic things), slippery (smooth, polished or icy surfaces), " +
  "hazard (hot, sharp or dangerous things), decor (flat background things with no collision: posters, curtains, clouds). " +
  "Rules: at least two objects must be platforms; at most one hazard, and none if there are fewer than 5 objects; " +
  "never list people, faces, or body parts.";

const SCHEMA = {
  type: "object",
  properties: {
    objects: {
      type: "array",
      maxItems: MAX_OBJECTS,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          phrase: { type: "string" },
          role: {
            type: "string",
            enum: ["platform", "bouncy", "slippery", "hazard", "decor"],
          },
          reason: { type: "string" },
        },
        required: ["label", "phrase", "role", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["objects"],
  additionalProperties: false,
} as const;

export interface ListedResult {
  list: ObjectList;
  latencyMs: number;
}

export async function listObjects(imageDataUrl: string): Promise<ListedResult> {
  const client = getMetaClient();
  const started = Date.now();
  let response: { output_text?: string };
  try {
    response = (await client.responses.create({
      model: SPARK_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: PROMPT },
            { type: "input_image", image_url: imageDataUrl, detail: "auto" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "object_list",
          schema: SCHEMA,
          strict: true,
        },
      },
      reasoning: { effort: "low" },
      max_output_tokens: 2048,
    })) as { output_text?: string };
  } catch (error) {
    throw new Error(
      `Spark request failed: ${readableError(error)} (after ${Date.now() - started} ms)`,
    );
  }
  const latencyMs = Date.now() - started;
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text ?? "");
  } catch {
    throw new Error(
      `Spark returned invalid JSON (after ${latencyMs} ms): ${(response.output_text ?? "").slice(0, 200)}`,
    );
  }
  const result = validateObjectList(parsed);
  if (!result.ok) {
    throw new Error(
      `Spark output failed validation (after ${latencyMs} ms): ${result.errors.join("; ")}`,
    );
  }
  return { list: result.list, latencyMs };
}

function readableError(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const e = error as { status?: unknown; message?: unknown };
    return `status ${String(e.status)}: ${typeof e.message === "string" ? e.message : JSON.stringify(e.message)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
