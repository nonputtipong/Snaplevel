import { describe, expect, test } from "bun:test";
import {
  MetaError,
  ZeroObjectsError,
  describeError,
  messageFor,
  withMetaRetry,
} from "./meta";

describe("getMetaClient", () => {
  test("throws a clear error when the key is missing", async () => {
    const saved = process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY;
    try {
      const { getMetaClient } = await import("./meta");
      expect(() => getMetaClient()).toThrow("MODEL_API_KEY is not set");
    } finally {
      if (saved !== undefined) {
        process.env.MODEL_API_KEY = saved;
      }
    }
  });

  test("constructs a client without network when the key exists", async () => {
    const saved = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-dummy-key";
    try {
      const { getMetaClient } = await import("./meta");
      const client = getMetaClient();
      expect(client.baseURL).toBe("https://api.meta.ai/v1");
    } finally {
      if (saved === undefined) {
        delete process.env.MODEL_API_KEY;
      } else {
        process.env.MODEL_API_KEY = saved;
      }
    }
  });
});

describe("withMetaRetry", () => {
  test("passes through a first-try success", async () => {
    let calls = 0;
    const value = await withMetaRetry(async () => {
      calls += 1;
      return "ok";
    });
    expect(value).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries once on 503 then keeps the outcome", async () => {
    let calls = 0;
    const value = await withMetaRetry(async () => {
      calls += 1;
      if (calls === 1) {
        throw new MetaError("busy", { status: 503 });
      }
      return "recovered";
    });
    expect(value).toBe("recovered");
    expect(calls).toBe(2);
  });

  test("a second 503 throws without a third try", async () => {
    let calls = 0;
    await expect(
      withMetaRetry(async () => {
        calls += 1;
        throw new MetaError("busy", { status: 503 });
      }),
    ).rejects.toThrow("busy");
    expect(calls).toBe(2);
  });

  test("non-503 errors never retry", async () => {
    let calls = 0;
    await expect(
      withMetaRetry(async () => {
        calls += 1;
        throw new MetaError("bad", { status: 400 });
      }),
    ).rejects.toThrow("bad");
    expect(calls).toBe(1);
  });
});

describe("messageFor", () => {
  const cases: Array<[string, unknown, string]> = [
    ["zero objects", new ZeroObjectsError(), "No game objects found"],
    ["billing status", new MetaError("x", { status: 402 }), "credits are exhausted"],
    [
      "billing keywords",
      new MetaError("quota exceeded for model", { status: 429 }),
      "credits are exhausted",
    ],
    ["model 429", new MetaError("slow", { status: 429 }), "rate-limited"],
    ["model 503", new MetaError("busy", { status: 503 }), "temporarily unavailable"],
    ["network", new TypeError("fetch failed"), "didn't answer"],
    ["default", new Error("boom"), "couldn't be built"],
  ];
  for (const [name, error, fragment] of cases) {
    test(`maps ${name}`, () => {
      expect(messageFor(error)).toContain(fragment);
    });
  }

  test("returns exactly one fixed string for hostile input", () => {
    const hostile = new MetaError(
      "sk-fake-999\nError: x\n    at evil (x.js:1:1)",
      { status: 503 },
    );
    expect(messageFor(hostile)).toBe(
      "The model is temporarily unavailable. Please try again.",
    );
  });
});

describe("describeError", () => {
  test("logs class plus status, never message or stack", () => {
    expect(
      describeError(
        new MetaError("sk-fake-999\n    at evil (x.js:1:1)", { status: 503 }),
      ),
    ).toBe("MetaError status 503");
    expect(describeError(new ZeroObjectsError())).toBe("ZeroObjectsError");
    expect(describeError(new Error("boom"))).toBe("Error");
  });
});
