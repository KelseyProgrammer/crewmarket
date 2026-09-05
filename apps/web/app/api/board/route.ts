import { boardData } from "../../../lib/board-data";

/* Public read-only board feed for the mobile app (Expo slice 1). Exactly the
   data the public directory renders — no auth, nothing private (V-2, D-3). */

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { profiles: await boardData() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
