import { NextRequest } from "next/server";
import { validateLevel } from "@/lib/level";
import level1 from "../../../../fixtures/level-1.json";
import level2 from "../../../../fixtures/level-2.json";
import level3 from "../../../../fixtures/level-3.json";

export const dynamic = "force-dynamic";

const FIXTURES = [level1, level2, level3];
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  if (process.env.MOCK_MODE !== "1") {
    return Response.json(
      { error: "Live level building is not available in this build." },
      { status: 501 },
    );
  }

  const index = Number(req.nextUrl.searchParams.get("fixture") ?? "0");
  if (!Number.isInteger(index) || index < 0 || index >= FIXTURES.length) {
    return Response.json(
      { error: "Unknown fixture. Use ?fixture=0, 1 or 2." },
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
