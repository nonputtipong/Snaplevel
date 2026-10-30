/** Server-side upload sniffing: type check plus dimensions from headers only. */

export type UploadImageType = "jpeg" | "png" | "webp";

export interface ImageInfo {
  type: UploadImageType;
  width: number;
  height: number;
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

/** Scan JPEG markers for the first start-of-frame segment (dims live there). */
function jpegDims(bytes: Uint8Array): { width: number; height: number } | null {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return null;
  }
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1];
    if (marker === 0xd9 || marker === 0xda) {
      return null; // EOI / start-of-scan: no SOF comes after this.
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2; // Standalone markers carry no length.
      continue;
    }
    const length = u16be(bytes, at + 2);
    if (length < 2 || at + length + 1 >= bytes.length) {
      return null;
    }
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        width: u16be(bytes, at + 7),
        height: u16be(bytes, at + 5),
      };
    }
    at += 2 + length;
  }
  return null;
}

function pngDims(bytes: Uint8Array): { width: number; height: number } | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return null;
  }
  if (bytes.length < 24) {
    return null;
  }
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  // First chunk must be IHDR; its length field is bytes 8..12 (must be 13).
  const ihdrLength =
    (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
  if (tag !== "IHDR" || ihdrLength !== 13) {
    return null;
  }
  const width =
    (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height =
    (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  return { width, height };
}

function webpDims(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 21 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return null;
  }
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  const payload = 20;
  if (chunk === "VP8 " && bytes.length >= payload + 10) {
    if (
      bytes[payload + 3] !== 0x9d ||
      bytes[payload + 4] !== 0x01 ||
      bytes[payload + 5] !== 0x2a
    ) {
      return null;
    }
    const width =
      (bytes[payload + 6] | (bytes[payload + 7] << 8)) & 0x3fff;
    const height =
      (bytes[payload + 8] | (bytes[payload + 9] << 8)) & 0x3fff;
    return { width, height };
  }
  if (chunk === "VP8L" && bytes.length >= payload + 5) {
    if (bytes[payload] !== 0x2f) {
      return null;
    }
    const packed =
      bytes[payload + 1] |
      (bytes[payload + 2] << 8) |
      (bytes[payload + 3] << 16) |
      (bytes[payload + 4] << 24);
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X" && bytes.length >= payload + 10) {
    const width =
      (bytes[payload + 4] | (bytes[payload + 5] << 8) | (bytes[payload + 6] << 16)) + 1;
    const height =
      (bytes[payload + 7] | (bytes[payload + 8] << 8) | (bytes[payload + 9] << 16)) + 1;
    return { width, height };
  }
  return null;
}

/** Sniff jpeg/png/webp from magic bytes and read dimensions. Null when unknown. */
export function inspectImageBytes(bytes: Uint8Array): ImageInfo | null {
  const jpeg = jpegDims(bytes);
  if (jpeg) {
    return { type: "jpeg", ...jpeg };
  }
  const png = pngDims(bytes);
  if (png) {
    return { type: "png", ...png };
  }
  const webp = webpDims(bytes);
  if (webp) {
    return { type: "webp", ...webp };
  }
  return null;
}
