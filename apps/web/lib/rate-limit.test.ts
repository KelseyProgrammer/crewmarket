import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimiter, windowCount } from "./rate-limit";

const OPTS = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimiter());

  it("allows up to `limit` requests inside one window", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("a", { ...OPTS, now: t0 }).allowed).toBe(true);
    expect(checkRateLimit("a", { ...OPTS, now: t0 + 1 }).allowed).toBe(true);
    expect(checkRateLimit("a", { ...OPTS, now: t0 + 2 }).allowed).toBe(true);
  });

  it("rejects the request after the limit with a ceil'd Retry-After", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("a", { ...OPTS, now: t0 + i });
    const r = checkRateLimit("a", { ...OPTS, now: t0 + 10_500 });
    expect(r.allowed).toBe(false);
    // window ends at t0+60_000 → 49_500ms left → ceil to 50s
    expect(r.retryAfterSec).toBe(50);
  });

  it("keys are isolated from each other", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) checkRateLimit("a", { ...OPTS, now: t0 });
    expect(checkRateLimit("b", { ...OPTS, now: t0 }).allowed).toBe(true);
  });

  it("a fresh window resets the count", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) checkRateLimit("a", { ...OPTS, now: t0 });
    expect(checkRateLimit("a", { ...OPTS, now: t0 + 60_000 }).allowed).toBe(true);
  });

  it("prunes stale windows so the map does not grow unbounded", () => {
    const t0 = 1_000_000;
    checkRateLimit("stale", { ...OPTS, now: t0 });
    checkRateLimit("fresh", { ...OPTS, now: t0 + 120_000 });
    expect(windowCount()).toBe(1); // only "fresh" survives
  });
});
