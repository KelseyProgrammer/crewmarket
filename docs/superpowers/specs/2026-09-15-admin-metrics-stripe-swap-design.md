# Design: Admin Metrics — Stripe Revenue Swap (SOW 7.iii)

Date: 2026-09-15
Status: approved in session (revenue = gross platform fee retained, sourced from
Stripe balance transactions, cached; realized/held split replaced by a Stripe-native
money-flow + available/pending balance). Fulfils the SOW 7.iii swap point marked in
`apps/web/lib/admin-metrics.ts` (`simulatedRevenueFromBookings`).

## Decision

Now that real Stripe money moves (payments-core shipped + live-drive passed 9/14),
the revenue tile stops deriving from `booking.feeCents` and instead reads the
platform's actual Stripe **balance transactions**. The figure is **gross platform
fee retained** = charges captured − refunds − crew payouts (gross of Stripe's own
processing fees). The old booking-*state* realized/held split is replaced with a
money-*movement* view plus Stripe's own available/pending balance, because balance
transactions are authoritative about money moved but know nothing about booking
lifecycle. Booking-state tiles (bookings-by-state, verification, accounts) are
untouched.

## 1. Data layer — payments package (`packages/payments`)

New server-only module `src/revenue.ts`:

- **Pure (unit-tested), no I/O:**
  - `aggregateBalanceTransactions(txns: { type: string; amount: number }[]): { grossChargesCents; refundsCents; crewPayoutsCents; platformFeesRetainedCents }`
    - `charge` / `payment` → `grossChargesCents += amount` (amount is the gross, positive)
    - `refund` / `payment_refund` → `refundsCents += -amount` (amount is negative)
    - `transfer` → `crewPayoutsCents += -amount` (amount is negative)
    - all other types (`stripe_fee`, `payout`, `topup`, `adjustment`, …) ignored for the headline
    - `platformFeesRetainedCents = grossChargesCents − refundsCents − crewPayoutsCents`
  - `sumUsdBalance(entries: { amount: number; currency: string }[]): number` — sum `amount` where `currency === "usd"`.
- **I/O:**
  - `stripeRevenue(): Promise<StripeRevenue>` — auto-paginates `balanceTransactions.list({ limit: 100 })` (loop on `has_more` via `starting_after`), retrieves `balance.retrieve()`, and returns:
    ```ts
    export type StripeRevenue = {
      grossChargesCents: number;
      refundsCents: number;
      crewPayoutsCents: number;
      platformFeesRetainedCents: number;
      availableCents: number; // withdrawable now
      pendingCents: number;   // still settling
    };
    ```
    Uses the existing lazy `stripeClient()`. A hard page cap (e.g. 50 pages / 5,000 txns) with a `console.warn` if exceeded — no silent truncation; revisit with a date window before real volume.

Exported from `packages/payments/src/index.ts`.

## 2. Data layer — web (`apps/web/lib/admin-metrics.ts`)

`AdminMetrics["revenue"]` becomes a discriminated union on `source`:

```ts
type Revenue =
  | { source: "stripe"; grossChargesCents; refundsCents; crewPayoutsCents;
      platformFeesRetainedCents; availableCents; pendingCents }
  | { source: "simulated"; realizedFeeCents; heldFeeCents };
```

`computeMetrics()`:
- If `process.env.STRIPE_SECRET_KEY` is unset → `source: "simulated"` from the
  existing `simulatedRevenueFromBookings()` (kept, unchanged) so CI / fresh clones
  render env-free.
- Else → call `stripeRevenue()` wrapped in the existing `ttl-cache` util (~60s,
  single global key — it is one platform-wide aggregate) and return `source: "stripe"`.
  On any Stripe error, `catch` → fall back to the simulated figure (page never
  hard-crashes on a Stripe hiccup, mirroring the `/account` degrade pattern). Log
  the error server-side.

`simulatedRevenueFromBookings`, `splitFees`, `HELD_FEE_STATES` all stay for the
fallback path. The booking rows are still fetched (needed for bookings-by-state), so
the fallback adds no query.

## 3. UI (`apps/web/app/admin/metrics/page.tsx`)

Revenue section branches on `m.revenue.source`:

- **`stripe`:**
  - Headline tile **"Platform fees · retained"** = `platformFeesRetainedCents`, note
    "Derived from Stripe balance transactions (SOW 7.iii)." A sub-note breaks down the
    flow: "{grossCharges} in · {refunds} refunded · {crewPayouts} to crew."
  - Tile **"Balance"** = `availableCents` available · `pendingCents` settling, note
    "Available to withdraw · still settling (charges clear in ~2 days)."
- **`simulated`:** the current two tiles (realized / held) with the existing simulated
  note — unchanged.

All money via `fmtUsd` (`@crewmarket/types`). Existing tokens only; zero client JS;
aggregates only (M-2/P-4). Bookings-by-state table, verification, accounts tiles
unchanged.

## 4. Compliance

- All copy passes `pnpm compliance:check` (M-1) — none of the classification-banned terms.
- Aggregates only; nothing ranks or lists individual crew (M-2/P-4).
- Admin-only route/gate unchanged; nothing renders publicly.
- Reads only ids/amounts already owned by Stripe (P-1) — no new PII.

## 5. Testing

- **Unit (packages/payments vitest):** `aggregateBalanceTransactions` over a mixed
  txn list (charge, payment, refund, transfer, and an ignored type) → correct four
  figures incl. the subtraction; empty list → zeros; `sumUsdBalance` filters currency.
- **Unit (apps/web vitest):** `computeMetrics` fallback when `STRIPE_SECRET_KEY`
  unset → `source: "simulated"`; Stripe-throws → simulated fallback (mock the payments
  module). `stripeRevenue`'s pagination loop is covered by mocking the list to return
  two pages.
- Gates: `pnpm lint`, `pnpm compliance:check`, apps/web + packages/payments vitest,
  `pnpm build`.
- Live check (keys present): load `/admin/metrics`, confirm the retained figure and
  balance match the Stripe test dashboard for the drive's charges/refunds/transfers.

## Out of scope

Charts, date-range filters, CSV export, per-crew breakdowns, net-of-Stripe-fees
accounting, disputes/adjustments beyond what balance transactions naturally include,
linking the page into nav, changing the non-revenue tiles.
