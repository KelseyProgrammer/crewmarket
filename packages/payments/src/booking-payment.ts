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
  refundCents: number
): Promise<string> {
  const refund = await stripeClient().refunds.create({
    payment_intent: paymentIntentId,
    amount: refundCents,
  });
  return refund.id;
}

/** Exactly-once = this idempotency key + the caller's null-check on stripeTransferId. */
export async function releaseCrewPayout(
  bookingId: string,
  accountId: string,
  rateCents: number
): Promise<string> {
  const transfer = await stripeClient().transfers.create(
    { amount: rateCents, currency: "usd", destination: accountId, metadata: { bookingId } },
    { idempotencyKey: `payout-${bookingId}` }
  );
  return transfer.id;
}
