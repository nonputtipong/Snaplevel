import { describe, expect, test } from "bun:test";

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
