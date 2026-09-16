import { headers } from "next/headers";
import { prisma } from "@crewmarket/db";
import { auth } from "../../../lib/auth";
import { bookingsForUser, type PartyRole } from "../../../lib/bookings";
import { toBookingSummary } from "../../../lib/booking-view";

/* GET /api/bookings — the caller's bookings as party-safe summaries (P-4).
   bookingsForUser already runs withElapsedWindow per row (lazy payout-on-read, P-2).
   For CREW callers the counterparty is the boat account's name, batch-resolved here;
   for BOAT callers the counterparty is the crew profile (no user lookup needed). */

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string; accountType?: string };
  const role: PartyRole = user.accountType === "CREW" ? "CREW" : "BOAT";

  const bookings = await bookingsForUser(user.id, role);

  let boatNameById: Record<string, string> = {};
  if (role === "CREW" && bookings.length > 0) {
    const boatUserIds = [...new Set(bookings.map((b) => b.boatUserId))];
    const users = await prisma.user.findMany({
      where: { id: { in: boatUserIds } },
      select: { id: true, name: true },
    });
    boatNameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  }

  const summaries = bookings.map((b) =>
    toBookingSummary(b, role, boatNameById[b.boatUserId] ?? "Boat"),
  );
  return Response.json({ bookings: summaries });
}
