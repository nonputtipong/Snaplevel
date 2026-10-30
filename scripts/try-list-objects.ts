// Usage: bun --env-file=.env.local scripts/try-list-objects.ts <image>
// Resizes to 1024 px (macOS sips), calls listObjects, prints result + latency.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listObjects } from "../src/lib/pipeline/listObjects";

const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error("usage: bun --env-file=.env.local scripts/try-list-objects.ts <image>");
  process.exit(2);
}

let jpegPath = input;
if (process.platform === "darwin") {
  jpegPath = join(tmpdir(), `snaplevel-try-${Date.now()}.jpg`);
  execFileSync("sips", ["-Z", "1024", "-s", "format", "jpeg", input, "--out", jpegPath], {
    stdio: "ignore",
  });
} else {
  console.warn("warning: not macOS, sending original bytes without resize");
}

const dataUrl = `data:image/jpeg;base64,${readFileSync(jpegPath).toString("base64")}`;
try {
  const { list, latencyMs } = await listObjects(dataUrl);
  console.log(`ok latency_ms=${latencyMs}`);
  console.log(JSON.stringify(list));
} catch (error) {
  console.log(`fail: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
