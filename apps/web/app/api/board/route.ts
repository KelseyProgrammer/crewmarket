import { boardData } from "../../../lib/board-data";
import { checkRateLimit } from "../../../lib/rate-limit";
import { createTtlCache } from "../../../lib/ttl-cache";

/* Public read-only board feed for the mobile app (Expo slice 1). Exactly the
   data the public directory renders — no auth BY DESIGN, nothing private
   (V-2, D-3); the marketplace directory is open (P-4). Response shape is
   hand-typed in apps/mobile/lib/board.ts — keep in lockstep; the seed JSON,
   not CrewCardData, is the runtime source of truth.

   Hardening (2026-09-13 bundle): per-IP fixed-window rate limit + a 30s
   in-process TTL cache so bursts never reach postgres. Both are in-memory
   and per-instance — honest at single-instance demo scale; needs a shared
   store before real multi-instance traffic. The 30s staleness is invisible
   next to the mobile client's session-long cache. */

export const dynamic = "force-dynamic";

const LIMIT = 60; // requests per key per window
const WINDOW_MS = 60_000;
const BOARD_TTL_MS = 30_000;

const boardCache = createTtlCache(async () => ({ profiles: await boardData() }), BOARD_TTL_MS);

function callerKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(req: Request) {
  const { allowed, retryAfterSec } = checkRateLimit(callerKey(req), {
    limit: LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!allowed) {
    return Response.json(
      { error: "The board is busy right now — try again in a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  return Response.json(await boardCache.get(), {
    headers: { "Cache-Control": "no-store" },
  });
}
