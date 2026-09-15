import type Stripe from "stripe";
import { stripeClient } from "./stripe";

/** Throws on a bad signature — the route maps that to a 400. */
export function verifyStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw new Error("payments: STRIPE_CONNECT_WEBHOOK_SECRET is not set");
  return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
