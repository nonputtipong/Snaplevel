import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { isDebugEnabled } from "@/lib/debug-guard";
import { MasksClient } from "./masks-client";

export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function contentType(name: string): string {
  if (name.endsWith(".png")) {
    return "image/png";
  }
  if (name.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

export default async function DebugMasksPage({
  searchParams,
}: {
  searchParams: Promise<{ photo?: string }>;
}) {
  if (!isDebugEnabled()) {
    notFound();
  }
  const samplesDir = join(process.cwd(), "samples");
  let photos: string[] = [];
  try {
    const entries = await readdir(samplesDir);
    photos = entries
      .filter((entry) =>
        IMAGE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")).toLowerCase()),
      )
      .sort();
  } catch {
    photos = [];
  }
  const { photo } = await searchParams;
  const selected = photos.includes(photo ?? "") ? (photo as string) : photos[0];
  let imageDataUrl = "";
  if (selected) {
    const bytes = await readFile(join(samplesDir, selected));
    imageDataUrl = `data:${contentType(selected)};base64,${bytes.toString("base64")}`;
  }
  return (
    <MasksClient photos={photos} photo={selected ?? ""} imageDataUrl={imageDataUrl} />
  );
}
