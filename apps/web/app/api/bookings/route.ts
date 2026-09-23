import { headers } from "next/headers";
import { prisma } from "@crewmarket/db";
import { auth } from "../../../lib/auth";
import { bookingsForUser, type PartyRole } from "../../../lib/bookings";
import { toBookingSummary } from "../../../lib/booking-view";
import { createBookingRequest } from "../../../lib/booking-create";

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

/* POST /api/bookings — boat-side booking creation from mobile (slice 5).
   Thin wrapper over lib/booking-create.ts: session gate, shape-coerce the
   body (client money fields can never reach the core — R4/P-4), map core
   errors to their status. Success returns only the id; the client fetches
   the party-safe projection from GET /api/bookings/[id]. Core exceptions
   (e.g. a DB error inside prisma.booking.create) intentionally propagate to
   Next's default 500 — house contract, same as the sibling booking routes;
   the mobile client's serverError() falls back to generic retry copy. */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string; accountType?: string };

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const result = await createBookingRequest(
    { id: user.id, accountType: user.accountType },
    {
      crewProfileId: typeof b.crewProfileId === "string" ? b.crewProfileId : "",
      tripType: typeof b.tripType === "string" ? b.tripType : "",
      startDate: typeof b.startDate === "string" ? b.startDate : "",
      // Number() like the web action: numeric strings coerce, garbage becomes
      // NaN and fails the core's integer-days guard — never a silent 1-day trip.
      days: b.days == null ? 1 : Number(b.days),
      piAttested: b.piAttested === true,
    }
  );

  // strict:false — narrow via "error" in result, never a boolean flag.
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.booking.id }, { status: 201 });
}
