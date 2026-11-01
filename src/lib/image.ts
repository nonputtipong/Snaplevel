export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Returns a user-facing rejection message, or null when the file is fine. */
export function checkUpload(file: { type: string; size: number }): string | null {
  if (file.type === "image/heic" || file.type === "image/heif") {
    return "That photo is an iPhone HEIC file, which browsers can't read. Pick it from your Photo Library instead and it will arrive as a JPEG.";
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Please choose a JPEG, PNG or WebP photo.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Please choose a photo smaller than 5 MB.";
  }
  return null;
}

/** Generates the bundled placeholder photo (plain raster, canvas-safe). */
export async function makeSamplePhoto(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }
  context.fillStyle = "#334155";
  context.fillRect(0, 0, 1024, 768);
  context.fillStyle = "#94a3b8";
  context.fillRect(80, 520, 480, 40);
  context.fillRect(640, 300, 200, 260);
  context.fillStyle = "#e2e8f0";
  context.font = "48px sans-serif";
  context.textAlign = "center";
  context.fillText("Sample photo", 512, 120);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) {
    throw new Error("Could not encode the sample photo.");
  }
  return blob;
}

/** Resizes to max 1024 px on the longest edge and encodes as JPEG. */
export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) {
    throw new Error("Could not encode the resized photo.");
  }
  return blob;
}
