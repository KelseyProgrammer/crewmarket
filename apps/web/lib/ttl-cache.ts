/* One-entry async TTL memo. Used by /api/board so request bursts serve a
   ≤30s-old payload instead of hitting postgres per request. Clock-injectable
   for tests; per-instance like the rate limiter (same demo-scale posture). */

export function createTtlCache<T>(load: () => Promise<T>, ttlMs: number) {
  let entry: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;
  return {
    async get(now: number = Date.now()): Promise<T> {
      if (entry && now - entry.at < ttlMs) return entry.data;
      if (inflight) return inflight;
      inflight = load()
        .then((data) => {
          entry = { at: now, data };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
  };
}
