import { headers } from "next/headers";
import { prisma } from "@crewmarket/db";
import { createBookingCheckout } from "@crewmarket/payments";
import { TRIP_TYPE_LABELS, type TripType } from "@crewmarket/types";
import { auth } from "../../../../../lib/auth";
import { partyRoleFor } from "../../../../../lib/bookings";

/* POST /api/bookings/[id]/checkout — native-callable counterpart to
   beginBookingCheckout. Only the BOAT party (403 otherwise) may pay, only at
   ACCEPTED (409 otherwise). Separate charges & transfers via createBookingCheckout
   (P-3). Returns the Checkout url as JSON (NOT a redirect) so the app can open it in
   an in-app browser; state does NOT change here — the webhook is the source of truth
   for funds-held (G-1). */

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string };

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return new Response("not found", { status: 404 });

  const role = await partyRoleFor(booking, user.id);
  if (role !== "BOAT") {
    return Response.json({ error: "Only the boat can pay for this booking." }, { status: 403 });
  }
  if (booking.state !== "ACCEPTED") {
    return Response.json({ error: "This booking isn't ready for payment." }, { status: 409 });
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = await createBookingCheckout(
    {
      bookingId: id,
      tripLabel: `${TRIP_TYPE_LABELS[booking.tripType as TripType]} — crew booking`,
      rateCents: booking.rateCents,
      feeCents: booking.feeCents,
    },
    {
      successUrl: `${base}/bookings/${id}?paid=pending`,
      cancelUrl: `${base}/bookings/${id}`,
    }
  );

  return Response.json({ url });
}
