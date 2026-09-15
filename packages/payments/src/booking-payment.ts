import { stripeClient } from "./stripe";

export type CheckoutInput = {
  bookingId: string;
  tripLabel: string; // e.g. "Full day — crew booking"
  rateCents: number;
  feeCents: number;
};
export type CheckoutUrls = { successUrl: string; cancelUrl: string };

/** Separate charges & transfers: full amount captured into the platform balance at
    booking. Two line items itemize the fee (P-3); amount_total = rate + fee. */
export async function createBookingCheckout(
  input: CheckoutInput,
  urls: CheckoutUrls
): Promise<string> {
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"], // card-only: async methods would complete Checkout before funds move

    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: input.rateCents,
          product_data: { name: input.tripLabel },
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: "usd",
          unit_amount: input.feeCents,
          product_data: { name: "Platform fee" },
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId: input.bookingId },
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
  });
  if (!session.url) throw new Error("payments: Checkout Session has no url");
  return session.url;
}

export async function refundBookingPayment(
  paymentIntentId: string,
  refundCents: number,
  idempotencyKey?: string
): Promise<string> {
  const refund = await stripeClient().refunds.create(
    { payment_intent: paymentIntentId, amount: refundCents },
    idempotencyKey ? { idempotencyKey } : undefined
  );
  return refund.id;
}

/**
 * Exactly-once crew payout, with Stripe itself as the source of truth.
 *
 * Two guards, no static idempotency key (a static key caches a transient
 * `balance_insufficient` failure for 24h and wedges every retry — see below):
 *
 * 1. `source_transaction` ties the transfer to the booking's own charge. Stripe
 *    holds the transfer until THAT charge's funds settle (separate charges &
 *    transfers leaves them `pending` for days), so the post-window payout never
 *    fails on general `balance_insufficient`. Stripe also caps the total
 *    transferred against a charge at the charge amount — and rateCents > feeCents
 *    always, so a second payout-sized transfer against the same charge is
 *    rejected. That makes a concurrent double-read (two lazy reads racing to pay)
 *    unable to double-pay: the loser errors and retries into guard 2.
 * 2. The `transfer_group` existence check adopts a transfer from a prior attempt
 *    whose HTTP response we lost (crash/timeout after create) instead of paying
 *    again — the crash-recovery net.
 */
export async function releaseCrewPayout(
  bookingId: string,
  accountId: string,
  rateCents: number,
  paymentIntentId: string
): Promise<string> {
  const transferGroup = `booking-${bookingId}`;
  const existing = await stripeClient().transfers.list({ transfer_group: transferGroup, limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  const intent = await stripeClient().paymentIntents.retrieve(paymentIntentId);
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  if (!chargeId) {
    throw new Error(`payments: no settled charge on PaymentIntent ${paymentIntentId} for booking ${bookingId}`);
  }

  const transfer = await stripeClient().transfers.create({
    amount: rateCents,
    currency: "usd",
    destination: accountId,
    transfer_group: transferGroup,
    source_transaction: chargeId,
    metadata: { bookingId },
  });
  return transfer.id;
}
