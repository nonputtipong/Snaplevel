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
});
