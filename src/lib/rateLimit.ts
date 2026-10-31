// Server-side only: best-effort spend protection for the public URL.
//
// Limits: in-memory per instance, so counts reset on restart/redeploy and
// are NOT shared across serverless instances. Treat counts as advisory.
// Real protection is the kill switch (MOCK_MODE=1 serves fixtures only);
// whether the Meta console offers a spend limit is still unknown
// (see docs/api-notes.md).

const HOUR_MS = 60 * 60 * 1000;

export const IP_WINDOW_MS = HOUR_MS;
export const IP_MAX_BUILDS = 10;
export const GLOBAL_WINDOW_MS = HOUR_MS;
export const GLOBAL_MAX_BUILDS = 200;

/**
 * Best-effort client identity. Header order is fixed; any direct client can
 * spoof these headers off-platform, so this only keys a budget guard.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) {
    return real;
  }
  const vercel = headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) {
    return vercel;
  }
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) {
    return forwarded;
  }
  return "unknown";
}

export interface RateLimiter {
  /** True when the call is allowed (and counted); false when over max. */
  check(key: string, max: number): boolean;
  reset(): void;
}

/** Fixed-window counter: at most max checked calls per key per window. */
export function createRateLimiter(windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, max: number): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    reset(): void {
      hits.clear();
    },
  };
}

/** Shared per-process instances (see limits comment above). */
export const ipLimiter = createRateLimiter(IP_WINDOW_MS);
export const globalLimiter = createRateLimiter(GLOBAL_WINDOW_MS);

export function resetRateLimiters(): void {
  ipLimiter.reset();
  globalLimiter.reset();
}

/** Positive integer env override, else the default. */
export function envMax(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
