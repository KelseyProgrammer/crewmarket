# QA report — G-3 (Stripe Connect flows tested end-to-end in test mode)

**Date:** 2026-09-16 · **Rule:** G-3 · **SOW:** item 7 (QA end-to-end in Stripe test mode).

## What G-3 requires

> **G-3** — Stripe Connect flows tested end-to-end in test mode incl. refund and dispute paths.
> *(docs/COMPLIANCE.md)*

## Verdict

**Met, to current product scope.** The full booking→payment→payout lifecycle and the
refund path are covered by a repeatable scripted drive that passed 21/21 against the Stripe
test-mode sandbox, and the supplementary UI checklist is complete with no failures. The one
part of G-3 the product cannot exercise yet — a *raised* dispute — is documented as an open
item below (there is no raise-a-dispute flow; only the 48h window that elapses into payout,
which IS tested).

## What was run

### 1. Scripted e2e drive — `scripts/e2e-booking-drive.mjs`

Environment: **local stack** (colima postgres + MinIO, `stripe listen` forwarding to
`localhost:3002/api/stripe/webhook`, `PORT=3002 pnpm dev`), **Stripe test mode** — the same
sandbox account as the deployed demo. All state transitions go through the real authed JSON
routes (`/api/bookings/[id]/event`, `/checkout`); Stripe + Prisma are read only for
assertions. Synthetic `e2e-*` accounts only.

Re-run: bring up the payments-core dev recipe (see the script header + HANDOFF), then
`node --env-file=.env.local scripts/e2e-booking-drive.mjs`. It is pause-for-pay: Stripe has
no API to complete a hosted Checkout session and the webhook's paid-status guard is exactly
what G-3 tests, so a human pays each Checkout with a test card and the script polls the
webhook. Full run output: `docs/qa/2026-09-16-g3-drive-output.txt`.

```
==== G-3 e2e drive: 21/21 PASS ====
```

Coverage:

- **Guards (Flow C)** — crew cannot send a boat-only event (403); boat cannot send a
  crew-only event (403); non-party GET is 404; non-party event rejected; checkout rejected
  unless ACCEPTED (409); terminal state is sticky under CAS (409).
- **Happy path (Flow A)** — crew accept → boat pays Checkout (`4000 0000 0000 0077`) →
  **webhook** flips to funds-held → PaymentIntent recorded → **charged amount ==
  totalCents** (30800c = rate 27500 + itemized fee 3300, P-3) → trip start → complete →
  **no payout inside the 48h window** (sits in DISPUTE_WINDOW, P-2) → window backdated →
  **PAID_OUT**, transfer **exactly rateCents** (27500c, platform fee retained) → a second
  ledger read **does not double-pay** (exactly-once via `source_transaction` + transfer id
  null-check).
- **Refund path (Flow B)** — accept → pay (`4242…`) → funds-held → weather-cancel →
  **full refund recorded on Stripe** (30800c == totalCents, tier 1.0, G-1) → after the
  window would elapse, **payout stays permanently blocked**.

### 2. Manual UI checklist — `docs/qa/2026-09-16-g3-ui-checklist.md`

Covers the surfaces the scripted drive can't see: ledger rendering in funds-held /
IN_PROGRESS / PAID_OUT, wrong-role action-slot, empty list, D-2 disclaimer placement, and
the "funds held, never escrow" copy sweep. **Status: COMPLETE 2026-09-16, no failures** —
walked on the local stack (all 7 states seeded via `demo-booking-drive.mjs`; the deployed
demo only carries three states, and component code + copy are identical between builds).
D-2 placement and the copy sweep were additionally grep-verified in rendered HTML, so they
hold on the deployed build too. One item warrants a note: during the walk the boat was seen
"Record trip start" on a funds-held booking — investigated and confirmed **correct**, not a
leak: trip start/complete are intentionally either-party attestations
(`EVENT_SIDES` = [BOAT, CREW], M-3 no-supervision), and the role-*specific* actions
(`CANCEL_BOAT` vs `CANCEL_CREW`, crew-only `CREW_ACCEPT`) are correctly split. The only
"escrow" strings in the funds-held HTML are the internal state enum and a derived CSS class,
never visible prose (badge renders "Funds held"). Results: `docs/qa/2026-09-16-g3-ui-checklist.md`.

## Prior evidence (referenced, not re-run here)

- **Payments core live test-mode drive — PASSED 9/14** (HANDOFF): crew Express onboarding →
  pay → webhook funds-held → weather-cancel full refund → backdated → automatic payout,
  fee retained. This report's scripted drive makes that lifecycle repeatable.
- **Mobile device passes 9/9–9/16** (HANDOFF): board, auth+claim, booking management incl.
  a boat Checkout payment on a physical iPhone.

## Open items

1. **No raise-a-dispute flow (client/attorney decision).** G-3 names "dispute paths". The
   product models a 48h `DISPUTE_WINDOW` that elapses into `PAID_OUT` (tested above), but
   nothing lets a party *raise* a dispute to halt payout. Building it needs policy first —
   who may raise, within what window, what resolution means — which is ToS/booking-agreement
   territory and per CLAUDE.md is escalated to a human, not AI-decided. **Escalated; not
   built.**
2. **EAS/standalone browser-return re-check** — the mobile boot-to-sign-in fix (`6188fcd`)
   is unit-tested but not device-re-verified; re-check on a standalone build (dev Expo Go
   reload behavior may not carry over).

## Notes

Test-mode connected-account setup is a one-time cost per database: the drive's
`ensureConnectedAccount` waits for the v2 `stripe_transfers` capability to go **active**
(not merely for an account id — the id exists the moment "Set up payouts" is clicked, while
transfers stay `restricted` until the final Express ToS submit). Test data accumulates
harmlessly in the sandbox; the drive resets only its own `e2e-*` bookings between runs.
