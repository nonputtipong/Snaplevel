import { validateLevel, type Level } from "./level";

export interface ProgressEvent {
  step: string;
  status: string;
  current?: number;
  total?: number;
  notes?: string[];
}

export interface SSEFrame {
  event: string;
  data: string;
}

/** Split raw SSE text into complete frames, returning leftover partial text. */
export function splitSSEEvents(buffer: string): [SSEFrame[], string] {
  const frames: SSEFrame[] = [];
  let rest = buffer;
  for (;;) {
    const index = rest.indexOf("\n\n");
    if (index === -1) {
      break;
    }
    const chunk = rest.slice(0, index);
    rest = rest.slice(index + 2);
    let event = "";
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (event) {
      frames.push({ event, data: dataLines.join("\n") });
    }
  }
  return [frames, rest];
}

export type BuildOutcome = "ok" | "empty";

export function getBuildOutcome(level: Level): BuildOutcome {
  return level.objects.length === 0 ? "empty" : "ok";
}

async function statusError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `The server answered with status ${res.status}.`;
}

function errorEventMessage(data: string): string {
  try {
    const parsed = JSON.parse(data) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return "The level couldn't be built.";
}

export async function postBuildLevel(
  photo: Blob,
  onProgress: (progress: ProgressEvent) => void,
): Promise<Level> {
  const form = new FormData();
  form.append("photo", photo, "photo.jpg");
  let res: Response;
  try {
    res = await fetch("/api/build-level", { method: "POST", body: form });
  } catch {
    throw new Error("Could not reach the server.");
  }
  if (!res.ok || !res.body) {
    throw new Error(await statusError(res));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const [frames, rest] = splitSSEEvents(buffer);
    buffer = rest;
    for (const frame of frames) {
      if (frame.event === "progress") {
        onProgress(JSON.parse(frame.data) as ProgressEvent);
      } else if (frame.event === "error") {
        throw new Error(errorEventMessage(frame.data));
      } else if (frame.event === "complete") {
        const result = validateLevel(JSON.parse(frame.data));
        if (!result.ok) {
          throw new Error("The level came back in an unreadable shape.");
        }
        return result.level;
      }
    }
  }
  throw new Error("The connection closed before the level arrived.");
}
