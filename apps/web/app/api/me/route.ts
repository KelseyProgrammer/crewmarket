import { headers } from "next/headers";
import { auth } from "../../../lib/auth";
import { claimedProfileId } from "../../../lib/bookings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string; accountType?: string };
  return Response.json({
    id: user.id,
    accountType: user.accountType ?? null,
    claimedProfileId: await claimedProfileId(user.id),
  });
}
