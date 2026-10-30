import { expect, test } from "bun:test";
import { isDebugEnabled } from "./debug-guard";

function setEnv(env: Record<string, string | undefined>, key: string, value: string | undefined): void {
  if (value === undefined) {
    delete env[key];
  } else {
    env[key] = value;
  }
}

function withEnv(nodeEnv: string | undefined, vercel: string | undefined, fn: () => void): void {
  const env = process.env as Record<string, string | undefined>;
  const savedNode = env.NODE_ENV;
  const savedVercel = env.VERCEL;
  setEnv(env, "NODE_ENV", nodeEnv);
  setEnv(env, "VERCEL", vercel);
  try {
    fn();
  } finally {
    setEnv(env, "NODE_ENV", savedNode);
    setEnv(env, "VERCEL", savedVercel);
  }
}

test("debug is enabled in local development", () => {
  withEnv("development", undefined, () => {
    expect(isDebugEnabled()).toBe(true);
  });
});

test("debug is disabled when NODE_ENV is production", () => {
  withEnv("production", undefined, () => {
    expect(isDebugEnabled()).toBe(false);
  });
});

test("debug is disabled on Vercel even outside production", () => {
  withEnv("development", "1", () => {
    expect(isDebugEnabled()).toBe(false);
  });
});
