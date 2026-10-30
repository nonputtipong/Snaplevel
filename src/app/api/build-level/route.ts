import { NextRequest } from "next/server";
import { validateLevel } from "@/lib/level";
import { MAX_UPLOAD_BYTES } from "@/lib/image";
import { inspectImageBytes } from "@/lib/imageHeader";
import { getMetaClient } from "@/lib/meta";
import { listObjects, MAX_OBJECTS } from "@/lib/pipeline/listObjects";
import { segmentObjects, SAM_CONCURRENCY } from "@/lib/pipeline/segment";
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
        const phrases = objects.map((o) => o.phrase);
        const samStarted = Date.now();
        let done = 0;
        const results = await segmentObjects(
          dataUrl,
          phrases,
          { width: info.width, height: info.height },
          SAM_CONCURRENCY,
          () => {
            done += 1;
            send("progress", {
              step: "segment",
              status: "done",
              current: done,
              total: phrases.length,
            });
          },
        );
        const samMs = Date.now() - samStarted;

        const designStarted = Date.now();
        const level = assembleLevel({
          objects: objects.map((o, i) => {
            const kept = results[i].kept;
            return {
              label: o.label,
              phrase: o.phrase,
              reason: o.reason,
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
        send("progress", { step: "design_level", status: "done" });
        send("complete", level);
      } catch {
        send("error", {
          message: "The level couldn't be built. Please try again.",
        });
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
