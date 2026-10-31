import { NextRequest } from "next/server";
import { validateLevel } from "@/lib/level";
import { MAX_UPLOAD_BYTES } from "@/lib/image";
import { inspectImageBytes } from "@/lib/imageHeader";
import { describeError, getMetaClient, messageFor } from "@/lib/meta";
import {
  GLOBAL_MAX_BUILDS,
  IP_MAX_BUILDS,
  clientIp,
  envMax,
  globalLimiter,
  ipLimiter,
} from "@/lib/rateLimit";
import { listObjects, MAX_OBJECTS } from "@/lib/pipeline/listObjects";
import {
  MAX_SAM_CALLS,
  SAM_CONCURRENCY,
  segmentObjectsWithRetry,
} from "@/lib/pipeline/segment";
import { toPolygons } from "@/lib/pipeline/toPolygons";
import { assembleLevel } from "@/lib/pipeline/assemble";
import level1 from "../../../../fixtures/level-1.json";
import level2 from "../../../../fixtures/level-2.json";
import level3 from "../../../../fixtures/level-3.json";
import levelEmpty from "../../../../fixtures/level-empty.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FIXTURES = [level1, level2, level3, levelEmpty];
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const RATE_LIMIT_MESSAGE =
  "Too many builds from your address. Please wait a while and try again.";

/**
 * Test-visible: fixed-string SSE error event plus a sanitized one-line
 * server log. Never echoes upstream text, keys, or stacks.
 */
export function reportLiveError(
  send: (event: string, data: unknown) => void,
  error: unknown,
): void {
  console.error("[build-level] live build failed:", describeError(error));
  send("error", { message: messageFor(error) });
}

async function liveBuildLevel(req: NextRequest): Promise<Response> {
  let photo: File | null = null;
  try {
    const entry = (await req.formData()).get("photo");
    photo = entry instanceof File ? entry : null;
  } catch {
    photo = null;
  }
  if (!photo) {
    return Response.json(
      { error: "Upload a photo to build a level." },
      { status: 400 },
    );
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "Please choose a photo smaller than 5 MB." },
      { status: 400 },
    );
  }
  const info = inspectImageBytes(bytes);
  if (!info) {
    return Response.json(
      { error: "Please choose a JPEG, PNG or WebP photo." },
      { status: 400 },
    );
  }
  // Best-effort spend guard, before the key check so it also covers a
  // misconfigured server (broken-server hits still consume quota; accepted).
  const ip = clientIp(req.headers);
  const ipAllowed = ipLimiter.check(
    ip,
    envMax("RATE_LIMIT_MAX", IP_MAX_BUILDS),
  );
  const globallyAllowed = globalLimiter.check(
    "global",
    envMax("RATE_LIMIT_GLOBAL_MAX", GLOBAL_MAX_BUILDS),
  );
  if (!ipAllowed || !globallyAllowed) {
    return Response.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  try {
    getMetaClient();
  } catch {
    return Response.json(
      { error: "The server is missing its model key." },
      { status: 500 },
    );
  }

  const dataUrl = `data:image/${info.type};base64,${Buffer.from(bytes).toString("base64")}`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        const totalStarted = Date.now();
        const listed = await listObjects(dataUrl);
        const findMs = Date.now() - totalStarted;
        send("progress", { step: "find_objects", status: "done" });

        const objects = listed.list.objects.slice(0, MAX_OBJECTS);
        const samStarted = Date.now();
        let done = 0;
        const { results, notes: retryNotes } = await segmentObjectsWithRetry(
          dataUrl,
          objects.map((o) => ({
            phrase: o.phrase,
            fallback: o.fallback,
            role: o.role,
          })),
          { width: info.width, height: info.height },
          {
            maxCalls: MAX_SAM_CALLS,
            concurrency: SAM_CONCURRENCY,
            onPhraseDone: () => {
              done += 1;
              send("progress", {
                step: "segment",
                status: "done",
                current: done,
                total: objects.length,
              });
            },
          },
        );
        const samMs = Date.now() - samStarted;

        const designStarted = Date.now();
        for (const result of results) {
          if (result.matches.length === 0) {
            console.info(`[build-level] zero matches, skipping: ${result.phrase}`);
          } else if (!result.kept) {
            console.info(`[build-level] dropped under 1% of image area: ${result.phrase}`);
          }
        }
        const { level, notes } = assembleLevel({
          objects: objects.map((o, i) => {
            const kept = results[i].kept;
            return {
              label: o.label,
              phrase: o.phrase,
              reason: o.reason,
              role: o.role,
              area: kept?.area ?? 0,
              polygons: kept
                ? toPolygons({ svgPath: kept.svgPath, box: kept.box })
                : [],
            };
          }),
          image: dataUrl,
          width: info.width,
          height: info.height,
          timings: {},
        });
        level.timings = {
          find_objects: findMs,
          segment: samMs,
          design_level: Date.now() - designStarted,
          total: Date.now() - totalStarted,
        };
        if (!validateLevel(level).ok) {
          send("error", {
            message: "The level came back in an unreadable shape.",
          });
          return;
        }
        send("progress", {
          step: "design_level",
          status: "done",
          notes: [...retryNotes, ...notes],
        });
        send("complete", level);
      } catch (error) {
        reportLiveError(send, error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: NextRequest) {
  if (process.env.MOCK_MODE !== "1") {
    return liveBuildLevel(req);
  }

  const index = Number(req.nextUrl.searchParams.get("fixture") ?? "0");
  if (!Number.isInteger(index) || index < 0 || index >= FIXTURES.length) {
    const valid = FIXTURES.map((_, i) => i).join(", ");
    return Response.json(
      { error: `Unknown fixture. Use ?fixture=${valid}.` },
      { status: 400 },
    );
  }

  const level = FIXTURES[index];
  if (!validateLevel(level).ok) {
    return Response.json({ error: "Fixture level is invalid." }, { status: 500 });
  }

  const total = level.objects.length;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      await sleep(DELAY_MS);
      send("progress", { step: "find_objects", status: "done" });
      for (let i = 0; i < total; i++) {
        await sleep(DELAY_MS);
        send("progress", {
          step: "segment",
          status: "done",
          current: i + 1,
          total,
        });
      }
      await sleep(DELAY_MS);
      send("progress", { step: "design_level", status: "done" });
      send("complete", level);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
