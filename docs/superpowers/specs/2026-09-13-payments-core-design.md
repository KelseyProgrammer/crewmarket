# Payments Core (Stripe Connect Express) — Design

**Date:** 2026-09-13 · **Status:** approved in session; build blocked on test keys
(client-owned Stripe account → Developer invite → keys into `.env.local`).

> **Amendment 2026-09-14:** keys landed; the sandbox is a new-generation Stripe account
> with the v1 Accounts API disabled (dashboard override needs the client's Administrator
> role). Crew account creation/onboarding/readiness therefore use **Accounts v2**
> (`v2.core.accounts` recipient configuration + `dashboard: "express"`, GA version
> `2026-08-26.dahlia` — probed live). Hosted onboarding UX, Checkout, webhook, refunds,
> and v1 Transfers (interoperable with v2 account ids) are unchanged. Implementation
> plan: `docs/superpowers/plans/2026-09-14-payments-core.md`.

Scope decided in session: **core only** — crew Express onboarding, boat pays at booking,
refunds on cancellation, automatic payout after the 48h window. The admin-metrics swap
(SOW 7.iii — revenue from Stripe reporting) is a follow-up spec once real test charges exist.
Mobile is untouched (booking stays a web handoff until slice 2+).

## Compliance frame (binding)

- **P-1**: Stripe Express owns KYC/bank/tax. We store Stripe **ids only** — account id,
  payment-intent id, refund id, transfer id. No bank, SSN, or tax fields, ever.
- **P-2**: funds held at booking; crew paid after `COMPLETED` + 48h window (machinery exists:
  `payoutReleasable`, lazy `withElapsedWindow`).
- **P-3**: fee itemized from the existing config (`PLATFORM_FEE_RATE = 0.12`,
  `PLATFORM_FEE_SIDE = "BOAT"` — both still open client decisions; UI renders config).
- **M-2**: accepting work is never gated on payout onboarding.
- **G-1**: "escrow" never appears in user copy ("funds held"); refund tiers and fee are
  config placeholders, not decisions.

## Charge topology: separate charges & transfers

Destination charges with manual capture are ruled out — auth holds expire at 7 days and trips
book weeks ahead. Instead:

1. Boat's payment is **captured at booking** into the platform's Stripe balance.
2. Cancellation refunds come out of that balance (full or per tier).
3. At release, `transfers.create` moves exactly `rateCents` to the crew's Express account
   (idempotency key `payout-<bookingId>`). The platform keeps `feeCents` as the remainder —
   no `application_fee_amount` needed in this topology.

## Components

### `packages/payments` (becomes real)
`stripe` SDK dependency; server-only. Exports:
- `createExpressAccount()` / `createOnboardingLink(accountId, returnUrl, refreshUrl)` /
  `payoutReadiness(accountId)` (fetches `payouts_enabled` live — no mirrored state)
- `createBookingCheckout(booking, quote, urls)` → Checkout Session (mode `payment`,
  `amount_total = totalCents`, `metadata.bookingId`)
- `refundBookingPayment(paymentIntentId, refundCents)`
- `releaseCrewPayout(bookingId, accountId, rateCents)` → transfer with idempotency key
- `REFUND_TIERS: Record<CancelState, number>` — **v1 placeholder: 1.0 (100%) for
  CANCELLED_WEATHER / CANCELLED_BOAT / CANCELLED_CREW.** Real tiers are attorney+client
  input (G-1); code reads config only.

### Schema (ids only, P-1)
- `Booking` += `stripePaymentIntentId String?`, `stripeRefundId String?`,
  `stripeTransferId String?`
- `CrewProfileClaim` += `stripeAccountId String?`

### Crew onboarding (`/account`)
"Set up payouts" → create Express account (US, transfers capability) if none, store id on the
claim, redirect via hosted Account Link; return/refresh URLs land back on `/account`, which
shows readiness from `payoutReadiness()` on load.

### Boat payment (booking ledger)
State `ACCEPTED` → primary action creates the Checkout Session server-side and redirects.
**Webhook is the source of truth**: state stays `ACCEPTED` until `checkout.session.completed`
arrives; the return page shows a "confirming payment" note in the interim.

### Webhook (`/api/stripe/webhook`)
Raw-body signature check (`STRIPE_CONNECT_WEBHOOK_SECRET`); 400 on bad signature; 200 on
unhandled event types. `checkout.session.completed`: load booking from metadata, verify
`amount_total === rateCents + feeCents`, drive `ESCROW_CONFIRMED` through the state machine
(replays are no-ops via `canTransition`), store the PaymentIntent id, stamp `fundsHeldAt`.
Amount mismatch: log + 200 + no transition (operator investigates; never trust the redirect).

### Refunds (existing cancellation actions)
From a funded state (`ESCROW_FUNDED`, `IN_PROGRESS` weather): compute
`refundCents = totalCents × REFUND_TIERS[target]`, **refund first, transition second** — a
failed refund errors the action, leaves state unchanged, retryable. Store the refund id.

### Payout release (lazy, automatic)
`withElapsedWindow` extends: when `payoutReleasable` and `stripeTransferId` is null →
`releaseCrewPayout(...)`; success stores the transfer id and transitions to `PAID_OUT`;
failure (crew not onboarded, Stripe error) leaves `DISPUTE_WINDOW` with a "payout waiting on
payout setup" note on the crew's ledger and retries on the next read. Exactly-once =
idempotency key + null-check on `stripeTransferId`.

## Testing

- **Unit (vitest, Stripe SDK mocked):** webhook guards (bad signature → 400, amount mismatch
  → no transition, replay → no-op), refund-tier math, payout idempotence (transfer id set →
  no second call), onboarding-gate failure leaves DISPUTE_WINDOW.
- **Live test-mode drive (needs keys):** Express-onboard a test crew → book → pay `4242` →
  webhook flips to funds-held → weather-cancel a second booking → refund visible → backdate
  `completedAt` via a small script → ledger view triggers transfer → verify in test dashboard.
- `stripe listen --forward-to localhost:3000/api/stripe/webhook` supplies the local
  `STRIPE_CONNECT_WEBHOOK_SECRET`; recipe goes into HANDOFF.

## Out of scope

Admin-metrics Stripe swap (follow-up spec), mobile booking flow (slice 2+), live keys /
production activation, real refund tiers and fee side (client/attorney, G-1), 1099/tax
anything (Stripe's), disputes/chargebacks handling beyond the 48h product window.
