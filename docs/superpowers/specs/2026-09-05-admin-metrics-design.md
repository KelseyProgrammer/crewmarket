# Design: Admin Metrics Dashboard

Date: 2026-09-05
Status: approved (revenue-source decision made with user: booking-derived and
dev-labeled simulated until Stripe lands; SOW 2.i "Admin Metrics Dashboard",
SOW 7.iii revenue-derivation obligation honored structurally)

## Decision (made with user 9/5/2026)

Pre-Stripe, net revenue is computed from booking records (`feeCents`) and the
tile carries a persistent label: "Simulated — derived from booking records
until Stripe payments go live." The revenue query is isolated in one
clearly-marked function so the Stripe phase swaps it for Stripe reporting
reads without touching the UI (SOW 7.iii: Stripe-derived, never hand-entered).

## 1. Route & gate

`/admin/metrics` — unlinked from any nav, gated identically to
`/admin/credentials`: session email ∈ `ADMIN_EMAILS` else `notFound()`;
`export const dynamic = "force-dynamic"`.

## 2. Data layer (`apps/web/lib/admin-metrics.ts`, server-only)

`computeMetrics()` returns:

- **revenue** (from `simulatedRevenueFromBookings()` — the swap point):
  `realizedFeeCents` (sum of `feeCents`, state `PAID_OUT`) and
  `heldFeeCents` (sum of `feeCents`, states `ESCROW_FUNDED`, `IN_PROGRESS`,
  `COMPLETED`, `DISPUTE_WINDOW`).
- **bookings**: total + per-state counts across the booking machine's states
  (CANCELLED_WEATHER first-class).
- **verification**: profiles with ≥1 admin-verified doc, verified doc count,
  docs awaiting review.
- **accounts**: user counts by accountType (CREW / BOAT).

Pure aggregation helpers (state bucketing, cents summation, verified-profile
counting) are separated from the Prisma calls and unit-tested (vitest,
`apps/web/lib`). Prisma queries use narrow `select`s.

## 3. UI (`apps/web/app/admin/metrics/page.tsx`)

Stat tiles + a booking-state table, server-rendered, zero client JS, existing
design tokens only (mono numerals, eyebrow labels, brass only where the
system already uses it). Money renders from cents via the existing formatter
in `@crewmarket/types`. The revenue tile always shows the simulated label.

**Aggregates only** — no per-crew earnings, no leaderboards, no orderings
that read as ranking (M-2/P-4).

## 4. Compliance

- All copy passes `pnpm compliance:check` (M-1).
- No new data collected; every figure derives from existing rows — nothing
  hand-entered (SOW 7.iii).
- Admin-only visibility; nothing here renders publicly.

## 5. Testing

TDD the pure aggregation helpers. Gates: compliance lint, `pnpm lint`,
apps/web + packages/ui vitest, `pnpm build`. Demo state: the booking drive's
7 seeded states populate the revenue/booking tiles; the seeded credential doc
starts self-reported, so the verification tile shows non-zero verified counts
only after an admin verifies it at `/admin/credentials`.

## Out of scope

Charts/graphs, date-range filters, CSV export, per-crew breakdowns, Stripe
wiring (separate phase), linking the page into any navigation.
