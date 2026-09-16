# E2e QA (G-3) — design

**Date:** 2026-09-16 · **Status:** approved direction (user, this date) · **Rule:** G-3
("Stripe Connect flows tested end-to-end in test mode incl. refund and dispute paths"),
SOW item 7 ("QA end-to-end in Stripe test mode, deliver per Section 3").

## Goal

Close G-3 with **repeatable** evidence (a rerunnable scripted drive, not a one-off manual
claim), verify the UI surfaces never covered by earlier passes, and produce a client-facing
QA report that also formally flags what G-3 cannot cover yet (no raise-a-dispute flow).

## Decisions already made (user-approved)

1. **Shape:** scripted API-level e2e drive + manual UI checklist. No Playwright, no new
   dependencies.
2. **Dispute gap:** the product has a 48h `DISPUTE_WINDOW` that elapses into `PAID_OUT`
   but **no way to raise a dispute** (`booking-machine.ts:30` — "no open dispute" is a
   comment, not code). QA tests window-elapse only; the missing flow is written up as an
   explicit client/attorney open item (dispute policy touches ToS/booking-agreement
   territory — human-decide per CLAUDE.md). G-3 closes as "tested to current scope, gap
   documented".
3. **Environments:** the script runs against the **local stack** (colima postgres,
   `stripe listen`, web dev on `PORT=3002` — same Stripe test-mode account as prod, and
   direct Prisma access for assertions; Neon's Sensitive vars make deployed-DB assertions
   impossible). The UI checklist runs against **crewmarket-web.vercel.app** (what the
   client sees), except states that require backdating (see §5).

## Constraint that shapes the script: pause-for-pay

Stripe has no API to complete a hosted Checkout session, and our webhook deliberately
re-verifies the session's paid status against Stripe — faking payment would bypass the
guard G-3 exists to test. The script is therefore **interactive-assisted**: fully
automated except that at each pay step it prints the Checkout URL, waits while the human
pays with a test card, and polls the DB until the webhook lands (bounded wait, then FAIL).
Two card entries per full run; everything else automatic.

## 1. Scripted drive — `scripts/e2e-booking-drive.mjs`

Run: `node --env-file=.env.local scripts/e2e-booking-drive.mjs` with the payments-core dev
recipe up (colima + `docker compose up -d`; `stripe listen --api-key $STRIPE_SECRET_KEY
--forward-to localhost:3002/api/stripe/webhook` with the printed `whsec_` in both
`.env.local` files; `PORT=3002 pnpm dev` in `apps/web`; `BETTER_AUTH_URL` matching).
Follows the existing drive-script pattern (`demo-booking-drive.mjs`,
`dev-backdate-booking.mjs`).

### Fixtures (idempotent)

- Fixed synthetic accounts `e2e-boat@example.com` / `e2e-crew@example.com` (created if
  absent, `disclaimerAccepted` stamped) and one synthetic crew profile claimed by the e2e
  crew account (DB-created, same approach as the demo scripts; V-2 untouched — the profile
  is created for this account, never reassigned).
- On start, the script deletes only its own prior artifacts: bookings between the two e2e
  accounts (keeps runs deterministic; touches nothing else).
- **Connected account:** payout assertions need a test-mode Stripe connected account with
  payouts active. The script reuses an existing onboarded account id if one is recorded
  for the e2e crew profile; otherwise it pauses once with the Express onboarding link and
  Stripe's test data (any name/DOB, SSN `000000000`, phone `0000000000`, test bank) — a
  one-time setup cost per database, after which runs need only the two pay steps.
- Auth: the script signs in via the Better Auth email/password HTTP endpoint and carries
  each role's session cookie for JSON-API calls (boat client, crew client, plus a third
  "stranger" account for non-party checks). State transitions go through the real
  authed routes (`POST /api/bookings/[id]/event`, `/checkout`) — the same code paths the
  apps use — with direct Prisma reads only for assertions and setup.

### Flow A — happy path through payout

request (boat) → accept (crew) → **pause-for-pay** (card `4000 0000 0000 0077` so charge
funds settle immediately and `source_transaction` doesn't hold the transfer) → assert
webhook flipped `ACCEPTED→ESCROW_FUNDED`, session amount == booking `totalCents` → trip
start → trip complete → read ledger **before** 48h and assert `DISPUTE_WINDOW` with **no
payout** → backdate `completedAt` 49h (reuse `dev-backdate-booking` logic) → authed
`GET /api/bookings/[id]` (runs `withElapsedWindow`) → assert `PAID_OUT`,
`stripeTransferId` set, transfer amount exactly `rateCents` (fee retained), and a second
read does not double-pay.

### Flow B — refund path

request → accept → **pause-for-pay** (`4242…` is fine; refunds don't need settled funds)
→ funds-held → `CANCEL_WEATHER` → assert refund recorded (full amount, tier 1.0), Stripe
refund object exists for the charge, and payout is permanently blocked (backdate + read →
still no transfer).

### Flow C — guards (no payment needed)

- Wrong-role events rejected (crew sends `CANCEL_BOAT`, boat sends `CREW_ACCEPT`).
- Non-party: stranger's `GET /api/bookings/[id]` → 404; stranger event POST rejected.
- `POST /checkout` rejected when booking is not `ACCEPTED` (e.g. already funded).
- Terminal-state stickiness: event POST against a cancelled booking rejected (CAS).

### Output

A PASS/FAIL line per assertion, summary table, nonzero exit on any FAIL. The report (§3)
pastes the run output verbatim.

## 2. Manual UI checklist — `docs/qa/2026-09-16-g3-ui-checklist.md`

Check-off doc; the user drives a browser against **crewmarket-web.vercel.app** with the
seeded demo accounts, driving one booking through the real flow. Items:

- Ledger detail rendering in `ESCROW_FUNDED` and `IN_PROGRESS` (never screenshot-verified).
- `PAID_OUT` ledger detail: **verified on the local stack instead** (requires backdating,
  impossible against Neon; same component code) — noted as such in the checklist.
- Wrong-role guard: signed in as the other party, action slot shows no forbidden actions.
- Empty bookings list state.
- D-2 disclaimer present at signup, on crew profiles, in the booking flow.
- Copy sweep on every booking surface: "funds held"/"delayed payout" language, the word
  "escrow" never user-visible (G-1/SOW copy law).

Each item gets checked/failed + notes; failures become fix tasks before the report closes.

## 3. Client-facing report — `docs/QA-G3.md`

- What G-3 requires; what was run (script + checklist), dated, with environments.
- Script output pasted; checklist results summarized.
- Prior evidence referenced: 9/14 payments live drive, mobile device passes 9/9–9/16.
- **Open items:** raise-a-dispute flow not built (client/attorney decision needed on
  policy before it can be designed — explicitly escalated, not AI-decided);
  browser-return re-check in a future EAS/standalone build; anything the checklist fails.

## Error handling

- Script: every pause has a bounded poll (~2 min) then FAIL with what to check
  (`stripe listen` running? right `whsec_`?). Assertions never leave fixtures half-made —
  setup is idempotent and re-runnable after any failure.
- A FAIL in any flow doesn't abort the others (independent bookings); summary reports all.

## Testing the tester

The script is itself the test artifact; its verification is a real green run — no unit
tests for the script, no new packages. `pnpm compliance:check` must stay green
(the checklist and report are prose scanned by the lint — "escrow" appears only in
rule-quoting contexts with `cl-allow` markers if needed).

## Out of scope

Mobile flows (three device passes stand as evidence), Playwright/browser automation, any
new dependency, building dispute-raise, seeding or mutating the deployed Neon DB beyond
what the normal demo flow creates.
