import { describe, expect, test } from "bun:test";
import {
  getBuildOutcome,
  sampleMode,
  postBuildLevel,
  splitSSEEvents,
} from "./buildClient";
import { validateLevel } from "./level";
import level1 from "../../fixtures/level-1.json";
import levelEmpty from "../../fixtures/level-empty.json";

describe("splitSSEEvents", () => {
  test("splits frames and keeps the partial tail", () => {
    const [frames, rest] = splitSSEEvents(
      'event: progress\ndata: {"step":"find_objects"}\n\n' +
        'event: progress\ndata: {"step":"seg',
    );
    expect(frames).toEqual([
      { event: "progress", data: '{"step":"find_objects"}' },
    ]);
    expect(rest).toBe('event: progress\ndata: {"step":"seg');
  });

  test("joins multi-line data", () => {
    const [frames, rest] = splitSSEEvents(
      "event: complete\ndata: {\"a\":1}\ndata: {\"b\":2}\n\n",
    );
    expect(frames).toEqual([
      { event: "complete", data: '{"a":1}\n{"b":2}' },
    ]);
    expect(rest).toBe("");
  });
});

describe("getBuildOutcome", () => {
  test("ok for a level with objects", () => {
    const result = validateLevel(level1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getBuildOutcome(result.level)).toBe("ok");
    }
  });

  test("empty for the zero-object fixture", () => {
    const result = validateLevel(levelEmpty);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getBuildOutcome(result.level)).toBe("empty");
    }
  });
});

describe("postBuildLevel", () => {
  const realFetch = globalThis.fetch;

  function stubFetch(res: Response): void {
    globalThis.fetch = (async () => res) as unknown as typeof fetch;
  }

  test("throws the message from an error event", async () => {
    stubFetch(
      new Response('event: error\ndata: {"message":"Boom."}\n\n', {
        status: 200,
      }),
    );
    try {
      await expect(
        postBuildLevel(new Blob(["x"]), () => undefined),
      ).rejects.toThrow("Boom.");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("prefers a JSON error body over the status text", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Bad photo." }), { status: 400 }),
    );
    try {
      await expect(
        postBuildLevel(new Blob(["x"]), () => undefined),
      ).rejects.toThrow("Bad photo.");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("falls back to the status text without a JSON body", async () => {
    stubFetch(new Response("nope", { status: 500 }));
    try {
      await expect(
        postBuildLevel(new Blob(["x"]), () => undefined),
      ).rejects.toThrow("The server answered with status 500.");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("returns the level on a complete event", async () => {
    const seen: string[] = [];
    stubFetch(
      new Response(
        'event: progress\ndata: {"step":"find_objects","status":"done"}\n\n' +
          `event: complete\ndata: ${JSON.stringify(levelEmpty)}\n\n`,
        { status: 200 },
      ),
    );
    try {
      const level = await postBuildLevel(new Blob(["x"]), (progress) =>
        seen.push(progress.step),
      );
      expect(level.objects).toEqual([]);
      expect(seen).toEqual(["find_objects"]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("sampleMode", () => {
  test("mock mode keeps the free pipeline", () => {
    expect(sampleMode(true)).toBe("pipeline");
  });

  test("live mode serves a fixture instead of building", () => {
    expect(sampleMode(false)).toBe("fixture");
  });
});
