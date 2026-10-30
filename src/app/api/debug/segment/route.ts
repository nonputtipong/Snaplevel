import { NextRequest } from "next/server";
import { isDebugEnabled } from "@/lib/debug-guard";
import { getMetaClient } from "@/lib/meta";
import { segmentObjects } from "@/lib/pipeline/segment";

export const dynamic = "force-dynamic";

const MAX_PHRASES = 8;

export async function POST(req: NextRequest) {
  if (!isDebugEnabled()) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { imageDataUrl, phrases, width, height } = (body ?? {}) as {
    imageDataUrl?: unknown;
    phrases?: unknown;
    width?: unknown;
    height?: unknown;
  };
  if (
    typeof imageDataUrl !== "string" ||
    !imageDataUrl.startsWith("data:image/")
  ) {
    return Response.json(
      { error: "imageDataUrl must be an image data URL." },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(phrases) ||
    phrases.length === 0 ||
    phrases.length > MAX_PHRASES ||
    phrases.some((p) => typeof p !== "string" || !p.trim())
  ) {
    return Response.json(
      { error: `phrases must be 1 to ${MAX_PHRASES} non-empty strings.` },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    (width as number) <= 0 ||
    (height as number) <= 0
  ) {
    return Response.json(
      { error: "width and height must be positive integers." },
      { status: 400 },
    );
  }
  try {
    getMetaClient();
  } catch {
    return Response.json(
      { error: "MODEL_API_KEY is not configured." },
      { status: 500 },
    );
  }
  const results = await segmentObjects(imageDataUrl, phrases, {
    width: width as number,
    height: height as number,
  });
  return Response.json({ results });
}
