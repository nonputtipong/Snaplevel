import { expect, test } from "bun:test";
import {
  clientIp,
  createRateLimiter,
  envMax,
} from "./rateLimit";

test("allows max calls then blocks within the window", () => {
  const limiter = createRateLimiter(60_000);
  expect(limiter.check("a", 2)).toBe(true);
  expect(limiter.check("a", 2)).toBe(true);
  expect(limiter.check("a", 2)).toBe(false);
});

test("counts keys independently", () => {
  const limiter = createRateLimiter(60_000);
  expect(limiter.check("a", 1)).toBe(true);
  expect(limiter.check("b", 1)).toBe(true);
  expect(limiter.check("a", 1)).toBe(false);
});

test("window expiry allows calls again", async () => {
  const limiter = createRateLimiter(20);
  expect(limiter.check("a", 1)).toBe(true);
  expect(limiter.check("a", 1)).toBe(false);
  await Bun.sleep(25);
  expect(limiter.check("a", 1)).toBe(true);
});

test("reset clears all counts", () => {
  const limiter = createRateLimiter(60_000);
  expect(limiter.check("a", 1)).toBe(true);
  limiter.reset();
  expect(limiter.check("a", 1)).toBe(true);
});

test("clientIp prefers x-real-ip, vercel, forwarded-for, unknown", () => {
  const headers = (pairs: [string, string][]) => new Headers(pairs);
  expect(clientIp(headers([["x-real-ip", "1.1.1.1"]]))).toBe("1.1.1.1");
  expect(
    clientIp(
      headers([
        ["x-vercel-forwarded-for", "2.2.2.2"],
        ["x-forwarded-for", "3.3.3.3"],
      ]),
    ),
  ).toBe("2.2.2.2");
  expect(clientIp(headers([["x-forwarded-for", "4.4.4.4, 5.5.5.5"]]))).toBe(
    "4.4.4.4",
  );
  expect(clientIp(headers([]))).toBe("unknown");
});

test("envMax reads a positive integer override", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.RATE_LIMIT_TEST_MAX;
  try {
    env.RATE_LIMIT_TEST_MAX = "3";
    expect(envMax("RATE_LIMIT_TEST_MAX", 10)).toBe(3);
    env.RATE_LIMIT_TEST_MAX = "nope";
    expect(envMax("RATE_LIMIT_TEST_MAX", 10)).toBe(10);
    env.RATE_LIMIT_TEST_MAX = "0";
    expect(envMax("RATE_LIMIT_TEST_MAX", 10)).toBe(10);
    delete env.RATE_LIMIT_TEST_MAX;
    expect(envMax("RATE_LIMIT_TEST_MAX", 10)).toBe(10);
  } finally {
    if (saved !== undefined) {
      env.RATE_LIMIT_TEST_MAX = saved;
    } else {
      delete env.RATE_LIMIT_TEST_MAX;
    }
  }
});
