// Server-side only: never import from client components.
// The key never leaves the server.

import OpenAI from "openai";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const SPARK_MODEL = "muse-spark-1.3";

export function getMetaClient(): OpenAI {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MODEL_API_KEY is not set. Copy .env.example to .env.local and add your Meta API key.",
    );
  }
  return new OpenAI({ baseURL: META_BASE_URL, apiKey });
}

/** Model-call failure with the upstream HTTP status preserved. */
export class MetaError extends Error {
  status?: number;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MetaError";
    const status = (cause as { status?: unknown } | null)?.status;
    if (typeof status === "number") {
      this.status = status;
    }
  }
}

/** Spark listed zero objects: a user-facing dead end, not a crash. */
export class ZeroObjectsError extends Error {
  constructor() {
    super("Spark listed zero objects");
    this.name = "ZeroObjectsError";
  }
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** Run fn once; on a 503 run it exactly once more and keep that outcome. */
export async function withMetaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (statusOf(error) !== 503) {
      throw error;
    }
    return await fn();
  }
}

function upstreamText(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

/**
 * User-facing message for a build failure. Returns ONLY fixed strings:
 * upstream text, keys, and stacks are used for classification at most and
 * never echoed.
 */
export function messageFor(error: unknown): string {
  if (error instanceof ZeroObjectsError) {
    return "No game objects found in that photo. Try a busier photo with a few solid objects.";
  }
  const status = statusOf(error);
  if (status === 402 || /billing|credit|quota/i.test(upstreamText(error))) {
    return "The project's model credits are exhausted. Please try again later.";
  }
  if (status === 429) {
    return "The model is rate-limited right now. Please wait a minute and try again.";
  }
  if (status === 503) {
    return "The model is temporarily unavailable. Please try again.";
  }
  if (
    error instanceof TypeError &&
    /fetch failed|network|terminated|socket|econn|enotfound/i.test(
      upstreamText(error),
    )
  ) {
    return "The model didn't answer. Please try again.";
  }
  return "The level couldn't be built. Please try again.";
}

/** One-line server-log summary: class plus status, never message or stack. */
export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name || "Error" : typeof error;
  const status = statusOf(error);
  return status === undefined ? name : `${name} status ${status}`;
}
