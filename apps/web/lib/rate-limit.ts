/* Fixed-window per-key rate limiter for the public board feed.
   In-memory and per-instance ON PURPOSE: demo-scale posture (HANDOFF debt
   item — "note before real traffic"). Counts reset on deploy/restart; a
   multi-instance deployment needs a shared store before this means anything.
   Pure + clock-injectable so vitest drives it without timers. */

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

type Window = { startMs: number; count: number };

const windows = new Map<string, Window>();

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  const now = opts.now ?? Date.now();
  prune(now, opts.windowMs);
  const w = windows.get(key);
  if (!w || now - w.startMs >= opts.windowMs) {
    windows.set(key, { startMs: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  w.count += 1;
  if (w.count > opts.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((w.startMs + opts.windowMs - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function prune(now: number, windowMs: number) {
  for (const [key, w] of windows) {
    if (now - w.startMs >= windowMs) windows.delete(key);
  }
}

/** Test hooks — not used by the route. */
export function resetRateLimiter(): void {
  windows.clear();
}
export function windowCount(): number {
  return windows.size;
}
