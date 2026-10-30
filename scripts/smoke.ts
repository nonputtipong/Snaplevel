// Usage: bun --env-file=.env.local scripts/smoke.ts
// Makes one tiny Muse Spark call. Never prints the API key.

import { SPARK_MODEL, getMetaClient } from "../src/lib/meta";

function extractText(response: unknown): string {
  if (typeof response === "object" && response !== null) {
    const outputText = (response as { output_text?: unknown }).output_text;
    if (typeof outputText === "string" && outputText) {
      return outputText;
    }
    const output = (
      response as { output?: { content?: { text?: string }[] }[] }
    ).output;
    if (Array.isArray(output)) {
      const texts: string[] = [];
      for (const item of output) {
        for (const part of item.content ?? []) {
          if (part.text) {
            texts.push(part.text);
          }
        }
      }
      if (texts.length > 0) {
        return texts.join("");
      }
    }
  }
  return `Unrecognized response shape: ${JSON.stringify(response).slice(0, 500)}`;
}

const started = Date.now();
try {
  const client = getMetaClient();
  const response = await client.responses.create({
    model: SPARK_MODEL,
    input: "Reply with exactly five words.",
  });
  console.log(`ok latency_ms=${Date.now() - started}`);
  console.log(extractText(response));
} catch (error) {
  console.log(`fail latency_ms=${Date.now() - started}`);
  if (error && typeof error === "object" && "status" in error) {
    const e = error as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
    };
    console.log(`status=${String(e.status)}`);
    if (e.code !== undefined) {
      console.log(`code=${String(e.code)}`);
    }
    console.log(
      `message=${typeof e.message === "string" ? e.message : JSON.stringify(e.message)}`,
    );
  } else {
    console.log(
      `error=${error instanceof Error ? error.message : String(error)}`,
    );
  }
  process.exitCode = 1;
}
