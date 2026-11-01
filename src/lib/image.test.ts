import { describe, expect, test } from "bun:test";
import { MAX_UPLOAD_BYTES, checkUpload } from "./image";

describe("checkUpload", () => {
  test("accepts a small JPEG", () => {
    expect(
      checkUpload(new File(["x"], "photo.jpg", { type: "image/jpeg" })),
    ).toBeNull();
  });

  test("rejects a non-image type", () => {
    expect(checkUpload({ type: "text/plain", size: 100 })).toBe(
      "Please choose a JPEG, PNG or WebP photo.",
    );
  });

  test("rejects an oversized photo", () => {
    expect(
      checkUpload({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }),
    ).toBe("Please choose a photo smaller than 5 MB.");
  });

  test("rejects HEIC with a Photo Library pointer", () => {
    expect(checkUpload({ type: "image/heic", size: 100 })).toBe(
      "That photo is an iPhone HEIC file, which browsers can't read. Pick it from your Photo Library instead and it will arrive as a JPEG.",
    );
    expect(checkUpload({ type: "image/heif", size: 100 })).toContain(
      "Photo Library",
    );
  });
});
