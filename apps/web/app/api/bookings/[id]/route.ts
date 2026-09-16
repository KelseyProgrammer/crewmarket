import { headers } from "next/headers";
import { prisma } from "@crewmarket/db";
import type { BookingState } from "@crewmarket/types";
import { auth } from "../../../../lib/auth";
import { partyRoleFor, withElapsedWindow } from "../../../../lib/bookings";
import { availableEventsFor } from "../../../../lib/booking-events";
import { toBookingDetail } from "../../../../lib/booking-view";

/* GET /api/bookings/[id] — one booking as a party-safe detail (P-4). Non-parties get
   404, never 403 (the ledger does not exist for them — don't reveal existence).
   withElapsedWindow runs on read (lazy payout-on-read, P-2); availableEvents is the
   real state-machine ∩ EVENT_SIDES result the client may act on (M-2/M-3). */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string };
  const { id } = await params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return new Response("not found", { status: 404 });

  const role = await partyRoleFor(booking, user.id);
  if (!role) return new Response("not found", { status: 404 }); // not a party — existence stays hidden

  const b = await withElapsedWindow(booking);
  const availableEvents = availableEventsFor(b.state as BookingState, role);

  let boatName = "Boat";
  if (role === "CREW") {
    const boat = await prisma.user.findUnique({ where: { id: b.boatUserId }, select: { name: true } });
    boatName = boat?.name ?? "Boat";
  }

  return Response.json({ booking: toBookingDetail(b, role, boatName, availableEvents) });
}
