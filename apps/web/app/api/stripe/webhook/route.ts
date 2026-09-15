import type Stripe from "stripe";
import { prisma } from "@crewmarket/db";
import { verifyStripeEvent } from "@crewmarket/payments";
import { canTransition, transition, type BookingState } from "@crewmarket/types";

/* Source of truth for funds-held (spec): the booking leaves ACCEPTED only when
   this event arrives — never on the Checkout redirect. Replays and out-of-order
   deliveries are no-ops via canTransition. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = verifyStripeEvent(rawBody, signature);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) {
    console.error(`stripe webhook: session ${session.id} has no bookingId metadata`);
    return Response.json({ received: true });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    console.error(`stripe webhook: no booking ${bookingId} for session ${session.id}`);
    return Response.json({ received: true });
  }

  if (!canTransition(booking.state as BookingState, "ESCROW_CONFIRMED")) {
    return Response.json({ received: true }); // replay or stale delivery
  }

  const expectedCents = booking.rateCents + booking.feeCents;
  if (session.amount_total !== expectedCents) {
    console.error(
      `stripe webhook: amount mismatch on ${bookingId} — got ${session.amount_total}, expected ${expectedCents}`
    );
    return Response.json({ received: true }); // no transition; never trust the redirect
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      state: transition(booking.state as BookingState, "ESCROW_CONFIRMED")!,
      stripePaymentIntentId: paymentIntentId,
      fundsHeldAt: new Date(),
    },
  });

  return Response.json({ received: true });
}
