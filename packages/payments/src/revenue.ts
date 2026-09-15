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
