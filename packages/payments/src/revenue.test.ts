import { describe, expect, it } from "vitest";
import { aggregateBalanceTransactions, sumUsdBalance } from "./revenue";

describe("aggregateBalanceTransactions (SOW 7.iii: gross platform fee retained)", () => {
  it("sums charges, subtracts refunds and transfers; ignores other types", () => {
    const txns = [
      { type: "charge", amount: 67200 },
      { type: "payment", amount: 33600 },
      { type: "refund", amount: -67200 },
      { type: "transfer", amount: -30000 },
      { type: "stripe_fee", amount: -195 },
      { type: "payout", amount: -1000 },
    ];
    const r = aggregateBalanceTransactions(txns);
    expect(r.grossChargesCents).toBe(100800);
    expect(r.refundsCents).toBe(67200);
    expect(r.crewPayoutsCents).toBe(30000);
    expect(r.platformFeesRetainedCents).toBe(100800 - 67200 - 30000);
  });

  it("empty list is all zeros", () => {
    expect(aggregateBalanceTransactions([])).toEqual({
      grossChargesCents: 0,
      refundsCents: 0,
      crewPayoutsCents: 0,
      platformFeesRetainedCents: 0,
    });
  });

  it("payment_refund counts as a refund", () => {
    const r = aggregateBalanceTransactions([
      { type: "charge", amount: 1000 },
      { type: "payment_refund", amount: -400 },
    ]);
    expect(r.refundsCents).toBe(400);
    expect(r.platformFeesRetainedCents).toBe(600);
  });
});

describe("sumUsdBalance", () => {
  it("sums usd amounts, ignores other currencies", () => {
    expect(
      sumUsdBalance([
        { amount: 5000, currency: "usd" },
        { amount: 200, currency: "usd" },
        { amount: 999, currency: "eur" },
      ])
    ).toBe(5200);
  });
  it("empty is zero", () => {
    expect(sumUsdBalance([])).toBe(0);
  });
});
