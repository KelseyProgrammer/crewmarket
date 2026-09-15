import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazy singleton: importing this package never requires env; calling it does. */
export function stripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("payments: STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}
