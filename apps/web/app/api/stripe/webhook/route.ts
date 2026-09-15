import type Stripe from "stripe";
import { prisma } from "@crewmarket/db";
import { refundBookingPayment, verifyStripeEvent } from "@crewmarket/payments";
import { transition, type BookingState } from "@crewmarket/types";

/* Source of truth for funds-held (spec): the booking leaves ACCEPTED only when
   this event arrives — never on the Checkout redirect. Replays and out-of-order
   deliveries are no-ops via transition returning null. */

export const dynamic = "force-dynamic";

/** A paid session that can't drive the transition and isn't a replay of the
    recorded charge is an orphaned double-charge (duplicate session, or payment
    racing a cancellation) — refund it in full. Refund failures throw → 500 →
    Stripe retries; the idempotency key makes retries converge. */
async function refundOrphanedCharge(
  booking: { id: string; state: string; stripePaymentIntentId: string | null },
  session: Stripe.Checkout.Session,
  paymentIntentId: string | null
) {
  if (!paymentIntentId || booking.stripePaymentIntentId === paymentIntentId) return; // replay of the recorded charge
  console.error(
    `stripe webhook: orphaned paid session ${session.id} on booking ${booking.id} (state ${booking.state}) — auto-refunding ${session.amount_total}`
  );
  await refundBookingPayment(paymentIntentId, session.amount_total ?? 0, `orphan-refund-${session.id}`);
}

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

  if (session.payment_status !== "paid") {
    console.error(
      `stripe webhook: session ${session.id} completed with payment_status ${session.payment_status} — no transition (async payment methods are not supported)`
    );
    return Response.json({ received: true });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    console.error(`stripe webhook: no booking ${bookingId} for session ${session.id}`);
    return Response.json({ received: true });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const next = transition(booking.state as BookingState, "ESCROW_CONFIRMED");
  if (!next) {
    await refundOrphanedCharge(booking, session, paymentIntentId);
    return Response.json({ received: true }); // replay or stale delivery
  }

  const expectedCents = booking.rateCents + booking.feeCents;
  if (session.amount_total !== expectedCents) {
    console.error(
      `stripe webhook: amount mismatch on ${bookingId} — got ${session.amount_total}, expected ${expectedCents}`
    );
    return Response.json({ received: true }); // no transition; never trust the redirect
  }

  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, state: booking.state }, // CAS: no-op if state moved since read
    data: { state: next, stripePaymentIntentId: paymentIntentId, fundsHeldAt: new Date() },
  });
  if (updated.count === 0) {
    // lost the race (e.g. concurrent cancel) — the payment may now be orphaned
    const current = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (current) await refundOrphanedCharge(current, session, paymentIntentId);
    return Response.json({ received: true });
  }

  return Response.json({ received: true });
}
