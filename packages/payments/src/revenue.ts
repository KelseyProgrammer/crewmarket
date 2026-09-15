import { stripeClient } from "./stripe";

export type StripeRevenue = {
  grossChargesCents: number;
  refundsCents: number;
  crewPayoutsCents: number;
  platformFeesRetainedCents: number;
  availableCents: number;
  pendingCents: number;
};

type Txn = { type: string; amount: number };

/** Gross platform fee retained (SOW 7.iii): charges − refunds − crew transfers.
    Gross of Stripe's own processing fees (stripe_fee/payout/topup are ignored). */
export function aggregateBalanceTransactions(txns: Txn[]): Omit<
  StripeRevenue,
  "availableCents" | "pendingCents"
> {
  let grossChargesCents = 0;
  let refundsCents = 0;
  let crewPayoutsCents = 0;
  for (const t of txns) {
    if (t.type === "charge" || t.type === "payment") grossChargesCents += t.amount;
    else if (t.type === "refund" || t.type === "payment_refund") refundsCents += -t.amount;
    else if (t.type === "transfer") crewPayoutsCents += -t.amount;
  }
  return {
    grossChargesCents,
    refundsCents,
    crewPayoutsCents,
    platformFeesRetainedCents: grossChargesCents - refundsCents - crewPayoutsCents,
  };
}

export function sumUsdBalance(entries: { amount: number; currency: string }[]): number {
  return entries.filter((e) => e.currency === "usd").reduce((s, e) => s + e.amount, 0);
}

const MAX_PAGES = 50; // 5,000 txns — revisit with a date window before real volume

/** Reads the platform's balance transactions (auto-paginated) + current balance.
    Authoritative money-movement source for the admin revenue tile (SOW 7.iii). */
export async function stripeRevenue(): Promise<StripeRevenue> {
  const client = stripeClient();
  const txns: Txn[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.balanceTransactions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const t of res.data) txns.push({ type: t.type, amount: t.amount });
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
    if (page === MAX_PAGES - 1) {
      console.warn("stripeRevenue: hit MAX_PAGES cap; totals may be truncated");
    }
  }

  const balance = await client.balance.retrieve();
  return {
    ...aggregateBalanceTransactions(txns),
    availableCents: sumUsdBalance(balance.available),
    pendingCents: sumUsdBalance(balance.pending),
  };
}
