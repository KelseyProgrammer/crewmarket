import { boardData } from "../../../lib/board-data";

/* Public read-only board feed for the mobile app (Expo slice 1). Exactly the
   data the public directory renders — no auth, nothing private (V-2, D-3).
   Response shape is hand-typed in apps/mobile/lib/board.ts — keep in lockstep;
   the seed JSON, not CrewCardData, is the runtime source of truth. */

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { profiles: await boardData() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
