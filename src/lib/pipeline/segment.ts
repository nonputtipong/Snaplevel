// Segmentation request, stream normalization, and result validation adapted
// from the Meta model cookbook sample 07_sam/01_api_basics/typescript/sam-api.ts
// (MIT License, © Meta Platforms, Inc.):
// https://github.com/meta-models/meta-model-cookbook

import {
  decodeMaskToRaster,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import type { Role } from "../level";
import { MetaError, getMetaClient, withMetaRetry } from "../meta";

export const SAM_MODEL = "sam-3.1";
export const SAM_CONCURRENCY = 4;
/** Hard ceiling on SAM calls per photo, primaries plus retries. */
export const MAX_SAM_CALLS = 12;
const MIN_AREA_FRACTION = 0.01;

export interface MaskMatch {
  /** [x1, y1, x2, y2] source pixels: the box the mask raster covers. */
  box: [number, number, number, number];
  /** Foreground pixel count. */
  area: number;
  /** SVG path in raster-local coords; place at (box[0], box[1]). */
  svgPath: string;
}

export interface SegmentPhraseResult {
  phrase: string;
  matches: MaskMatch[];
  kept: MaskMatch | undefined;
  latencyMs: number;
}

/** Largest match at or above 1% of image area; undefined when none qualify. */
export function selectKeptMatch(
  matches: MaskMatch[],
  imageArea: number,
): MaskMatch | undefined {
  let best: MaskMatch | undefined;
  for (const match of matches) {
    if (match.area < imageArea * MIN_AREA_FRACTION) {
      continue;
    }
    if (!best || match.area > best.area) {
      best = match;
    }
  }
  return best;
}

export function buildMatches(
  masks: readonly SegmentationMaskRecord[],
): MaskMatch[] {
  return masks.map((record) => {
    const raster = decodeMaskToRaster(record.mask);
    let area = 0;
    for (const value of raster) {
      area += value;
    }
    return {
      box: [
        record.bounds.left,
        record.bounds.top,
        record.bounds.right,
        record.bounds.bottom,
      ],
      area,
      svgPath: decodeMaskToSVGPath(record.mask),
    };
  });
}

type EventStream = AsyncIterable<ResponsesEvent>;

// The API streams `response.content_part.done` but not `response.output_text.done`,
// which the parser uses to finalize a text lane — synthesize it from the content part.
async function* normalizedEvents(
  stream: AsyncIterable<unknown>,
): EventStream {
  const completed = new Set<string>();
  for await (const raw of stream) {
    const event = raw as {
      type?: string;
      item_id?: unknown;
      output_index?: unknown;
      content_index?: unknown;
      part?: { type?: unknown; text?: unknown } | null;
    };
    const lane = `${String(event.item_id)}:${String(event.output_index)}:${String(event.content_index)}`;
    if (event.type === "response.output_text.done") {
      if (!completed.has(lane)) {
        completed.add(lane);
        yield event as unknown as ResponsesEvent;
      }
      continue;
    }
    yield event as unknown as ResponsesEvent;
    if (
      event.type === "response.content_part.done" &&
      !completed.has(lane) &&
      event.part &&
      typeof event.part === "object" &&
      event.part.type === "output_text" &&
      typeof event.part.text === "string"
    ) {
      completed.add(lane);
      yield {
        type: "response.output_text.done",
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        text: event.part.text,
      } as unknown as ResponsesEvent;
    }
  }
}

function validateResult(result: ImageSegmentationResult): void {
  if (result.outcome.status !== "completed") {
    const outcome = result.outcome as { reason?: unknown; detail?: unknown };
    throw new Error(
      `Segmentation was incomplete: ${String(outcome.reason)} (${String(outcome.detail ?? "")})`,
    );
  }
  const errors = result.diagnostics.filter(
    (item) => item.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(
      `The parser rejected records: ${errors.map((item) => `line ${item.line}: ${item.message}`).join("; ")}`,
    );
  }
}

export async function segmentPhrase(
  imageDataUrl: string,
  phrase: string,
  imageSize: { width: number; height: number },
): Promise<SegmentPhraseResult> {
  const concept = phrase.trim();
  if (!concept) {
    throw new Error("The concept must be a short noun phrase.");
  }
  const started = Date.now();
  const client = getMetaClient();
  let stream: unknown;
  try {
    stream = await withMetaRetry(() =>
      client.responses.create({
        model: SAM_MODEL,
        stream: true,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: concept },
              { type: "input_image", image_url: imageDataUrl, detail: "auto" },
            ],
          },
        ],
      }),
    );
  } catch (error) {
    throw new MetaError(
      `Segmentation request failed after ${Date.now() - started} ms`,
      error,
    );
  }
  const result = await parseImageStream(
    normalizedEvents(stream as AsyncIterable<unknown>),
  ).finalResult;
  const latencyMs = Date.now() - started;
  validateResult(result);
  const matches = buildMatches(recordsOfKind(result.records, "mask"));
  const kept = selectKeptMatch(
    matches,
    imageSize.width * imageSize.height,
  );
  return { phrase: concept, matches, kept, latencyMs };
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function segmentObjects(
  imageDataUrl: string,
  phrases: string[],
  imageSize: { width: number; height: number },
  concurrency = SAM_CONCURRENCY,
  onPhraseDone?: (index: number, result: SegmentPhraseResult) => void,
): Promise<SegmentPhraseResult[]> {
  return mapLimit(phrases, concurrency, async (phrase, index) => {
    const result = await segmentPhrase(imageDataUrl, phrase, imageSize);
    onPhraseDone?.(index, result);
    return result;
  });
}

export interface SegmentItem {
  phrase: string;
  fallback: string | null;
  role: Role;
}

/** Retry priority when the cap covers fewer than all zero-matches. */
const RETRY_ROLE_ORDER: Role[] = [
  "platform",
  "bouncy",
  "slippery",
  "hazard",
  "decor",
];

export interface SegmentWithRetryResult {
  results: SegmentPhraseResult[];
  notes: string[];
}

export async function segmentObjectsWithRetry(
  imageDataUrl: string,
  items: readonly SegmentItem[],
  imageSize: { width: number; height: number },
  options?: {
    maxCalls?: number;
    concurrency?: number;
    onPhraseDone?: (index: number, result: SegmentPhraseResult) => void;
    segmentFn?: typeof segmentPhrase;
  },
): Promise<SegmentWithRetryResult> {
  const maxCalls = options?.maxCalls ?? MAX_SAM_CALLS;
  const concurrency = options?.concurrency ?? SAM_CONCURRENCY;
  const onPhraseDone = options?.onPhraseDone;
  const segmentFn = options?.segmentFn ?? segmentPhrase;
  const results = await mapLimit(items, concurrency, async (item, index) => {
    const result = await segmentFn(imageDataUrl, item.phrase, imageSize);
    onPhraseDone?.(index, result);
    return result;
  });
  const candidates = results
    .map((result, index) => ({ result, index }))
    .filter(
      ({ result, index }) =>
        result.matches.length === 0 && items[index].fallback !== null,
    )
    .sort(
      (a, b) =>
        RETRY_ROLE_ORDER.indexOf(items[a.index].role) -
        RETRY_ROLE_ORDER.indexOf(items[b.index].role),
    );
  const notes: string[] = [];
  const budget = Math.max(0, maxCalls - results.length);
  const chosen = candidates.slice(0, budget);
  const retried = await mapLimit(chosen, concurrency, async ({ index }) => {
    const fallback = items[index].fallback as string;
    const retry = await segmentFn(imageDataUrl, fallback, imageSize);
    return { index, fallback, retry };
  });
  for (const { index, fallback, retry } of retried) {
    results[index] = { ...retry, phrase: items[index].phrase };
    notes.push(
      retry.matches.length === 0
        ? `Retried '${items[index].phrase}' as '${fallback}': no matches`
        : `Retried '${items[index].phrase}' as '${fallback}': ${retry.matches.length} matches`,
    );
  }
  if (candidates.length > chosen.length) {
    notes.push(`Some retries skipped: ${maxCalls}-call cap reached.`);
  }
  return { results, notes };
}
