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
 * A prior attempt whose HTTP response we lost (crash/timeout after the transfer
 * was created) still shows up in the transfer_group here, so we adopt it instead
 * of paying twice. Critically, we do NOT pin a static idempotency key: separate
 * charges & transfers means the charge sits in `pending` for days before it is
 * `available`, so the first payout attempt after the 48h window routinely fails
 * with `balance_insufficient` — and Stripe caches that failure against a static
 * key for 24h, wedging every retry. The existence check gives at-most-once
 * without letting a transient failure poison future reads.
 */
export async function releaseCrewPayout(
  bookingId: string,
  accountId: string,
  rateCents: number
): Promise<string> {
  const transferGroup = `booking-${bookingId}`;
  const existing = await stripeClient().transfers.list({ transfer_group: transferGroup, limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  const transfer = await stripeClient().transfers.create({
    amount: rateCents,
    currency: "usd",
    destination: accountId,
    transfer_group: transferGroup,
    metadata: { bookingId },
  });
  return transfer.id;
}
