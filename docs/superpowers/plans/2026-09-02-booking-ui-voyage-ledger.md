# Plan: Booking UI — The Voyage Ledger (per docs/BOOKING_BRIEF.md, confirmed 8/28)

**Goal:** Ship the full booking flow UI on the existing data layer: request form on crew
profiles, crew accept/decline, one shared ledger document for both parties in all ten states,
per-account bookings lists, simulated funds-held control. Direct bookings only.

**Already built (verified 2026-09-02, commit `75e31ea`):** Prisma `Booking` +
`CrewProfileClaim`; `packages/types` state machine (`canTransition`/`transition`/
`payoutReleasable` — build ON it, never modify) and pricing (`computeQuote`, itemized fee
from `PLATFORM_FEE_RATE` config, cents everywhere); `apps/web/lib/bookings.ts` (party
resolution, lazy `DISPUTE_WINDOW_ELAPSED`, `voyageNo`, date formatting). Auth: Better Auth
sessions with `accountType`; account shell + middleware exist. Visual world: the weigh-in
board (root DESIGN.md) — ledger renders through existing components (`BookingStateBadge`,
`DisclaimerD2`, board panels, two-finish brass), zero new hues.

**Binding constraints (docs/BOOKING_BRIEF.md + COMPLIANCE.md):** user-facing copy says
"funds held"/"delayed payout", NEVER "escrow" (internal enum `ESCROW_FUNDED` never renders —
`BookingStateBadge` already maps it to "Funds held"); decline is an equal ghost, zero
penalty/friction copy (M-2); TRIP_START/COMPLETE are attestations, never clock-ins (M-3);
fee itemized on the request screen, same numbers onward (P-3/R4); P&I attestation checkbox
required (D-4); D-2 in the flow (last contractual placement); cancellation refund tiers
point to the agreement, no invented percentages (G-1); CANCELLED_WEATHER informational navy,
never error-red; no ranks, no urgency, no chat. `pnpm compliance:check` green at every task.

---

## Task B.1 — Server actions (`apps/web/app/bookings/actions.ts`)

`"use server"` module; every action re-checks session + party role server-side and drives
the machine with `transition()` — an invalid event re-renders current state (stale-tab rule).

- `createBookingAction(formData)`: boat-only. Validates crew profile id, trip type offered
  by that profile (`tripTypesFor`), start date, days ≤ `maxDaysFor`, P&I attested.
  Recomputes the quote server-side (`computeQuote` — R4: same numbers, never trusts client
  math). Creates `Booking` (REQUESTED, `piAttestedAt`), redirects to `/bookings/[id]`.
- `bookingEventAction(bookingId, event)`: shared driver for `CREW_ACCEPT`, `CREW_DECLINE`,
  `CANCEL_BOAT`, `CANCEL_CREW`, `CANCEL_WEATHER`, `ESCROW_CONFIRMED` (demo), `TRIP_START`,
  `TRIP_COMPLETE`. Role gates: CREW_* events crew-side; CANCEL_BOAT + ESCROW_CONFIRMED
  boat-side; CANCEL_WEATHER + TRIP_START + TRIP_COMPLETE either party (attestation, M-3).
  Stamps the matching timestamp column; `TRIP_COMPLETE` immediately also applies the system
  event `PAYOUT_SCHEDULED` (COMPLETED → DISPUTE_WINDOW) so the ledger always shows the 48h
  window with `payoutReleaseAt(completedAt)`. Terminal states stamp `closedAt`.
  `revalidatePath` on the ledger + list.

## Task B.2 — Request form (`/bookings/new?crew=<id>`, boat-only, dynamic)

One screen: crew identity line (name · port · roles), trip type radios (only listed rates,
M-2), start date, days (only for MULTI_DAY/TOURNAMENT), **money block** — crew rate basis ×
days, itemized platform fee from config, total, labeled "Rate set by the crew member" —
P&I attestation checkbox (required, D-4), agreement note naming both parties (M-4), D-2.
No JS quote preview needed in v1: the form posts and the money block renders server-side
from the same `computeQuote` both before (GET with params) and at create. Guards: signed-in
BOAT only (crew accounts see an honest "boat accounts book crew" panel; signed-out →
sign-in redirect with `from`).

## Task B.3 — The ledger (`/bookings/[id]`, both parties only)

The one canonical document (R1–R5): mono eyebrow `VOYAGE Nº · dates · port` → parties block
(boat account name, crew display name; platform visibly the ledger-keeper via a rule line,
not a party) → money block (same numbers, held-location line) → **vertical trail**, exactly
one lit step (Requested → Accepted → Funds held → Underway → 48h review → Paid out), the
funds-held step carrying the brass-edged held-funds object with computed release date once
known → action slot (one brass action per role per state, outcome-labeled; decline/cancel
as equal ghosts) → terminal cancellation panels (weather = informational navy; refunds
"per the booking agreement", G-1) → D-2. Simulated funding: at ACCEPTED the boat side sees
a clearly dev-labeled demo control ("DEV · SIMULATED — Stripe PaymentIntent lands here")
firing `ESCROW_CONFIRMED`. Non-parties get `notFound()`; signed-out → sign-in.

## Task B.4 — Bookings list (`/bookings`) + shell wiring

Role-branched registry index: board-style rows (voyage eyebrow, counterparty, dates,
`BookingStateBadge`, total) linking to the ledger; empty states per role (boat: "browse the
directory"; crew without a claimed profile: name the demo-claim gap honestly). Masthead nav
gains "Bookings" for signed-in users? — masthead is static in layout; instead the account
shell's live-action block links to `/bookings`, and the BOAT "upcoming" BOOKING row is
replaced by the live link (crew side likewise). Profile page booking panel (static) links
to `/bookings/new?crew=<id>` with honest copy about the demo payment step.

## Task B.5 — Ledger CSS (globals.css, board world)

`.ledger*` styles from existing tokens only: board panel framing (1px line-strong, 2px navy
rule), trail as a vertical rail with one lit step (brass edge + white face; future steps
ink-soft; past steps navy check), held-funds object (white plate, brass-engrave inset edge,
mono amount, release line), action slot (btn--brass + btn--ghost-ink pair), cancellation
panel (navy-muted informational), list rows reusing board row grammar. Tabular numerals,
reduced-motion covered by the global rule, no new motion (the strip owns the world's one
moment). Request-form money block reuses the same held-funds plate grammar.

## Task B.6 — Demo claim script + drive-through verification

- `scripts/demo-claim.mjs`: `node scripts/demo-claim.mjs <userEmail> <profileId>` upserts
  `CrewProfileClaim` (documented demo bridge; refuses non-CREW accounts).
- `scripts/demo-booking-drive.mjs` (dev-only, synthetic): creates demo BOAT + CREW users if
  absent (Better Auth signup API over HTTP), claims a profile, then drives one booking per
  interesting state for screenshots/QA.
- Verify: `pnpm --filter web build`, `pnpm compliance:check`, ui tests; with colima/postgres
  up: drive states, screenshot request form + ledger states desktop/mobile (CDP script from
  the scratchpad pattern), fix material gaps in one batch.

**Exit criteria:** build/lint/tests green; every state of docs/BOOKING_BRIEF.md §States
renders (6 trail steps, 3 terminal panels, PAID_OUT, empty lists, wrong-role guards, stale
tab re-render); no "escrow" in rendered copy (lint + manual grep of built HTML); D-2
present on request form and ledger; commits per task with rule IDs.

**Out of scope (later phases):** real Stripe PaymentIntent/Connect, JobPost board, crew
onboarding/profile ownership, reviews, admin metrics, Expo parity, e2e QA (G-3).
