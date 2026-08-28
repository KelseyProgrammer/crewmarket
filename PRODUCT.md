# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Crew** — mates, deckhands, and licensed captains (USCG OUPV / Master class) working the South
Florida sportfishing fishery as independent contractors. Mobile-first, dock-at-5am usage: they check
availability, job alerts, and booking status from their phones before lines-in. They set their own
rates and accept or decline work at their sole discretion.

**Boats** — private owners, charter operations, and tournament programs who need credentialed crew
for half-day, full-day, multi-day, tournament, and delivery trips. Repeat-hire, relationship-driven
industry; often booking on short notice.

Admin (platform operator) reviews uploaded credentials and sets the `verified` flag — the platform
provides the mechanism only (SOW 2.ii).

## Product Purpose

A directory + booking marketplace connecting independent sportfishing crew with boat owners and
charter operators. Crew list services and availability; boats book them with payment held at booking
and released after trip completion plus a 48-hour dispute window. Success for the MVP: working web
app (directory, accounts, booking, payments, credential verification), mobile feature parity, and an
admin metrics dashboard whose Stripe-derived net revenue becomes the SOW v2 bonus metric.

**Identity rule:** Crew Market is a marketplace — NOT an employer, crewing agency, or vessel
operator. This is the product's legal spine (contractor classification, docs/COMPLIANCE.md).

## Positioning

The mechanism a neighboring product could not truthfully copy without doing the work: admin-verified
maritime credentials (USCG/STCW/TWIC with license class and expiry surfaced), escrowed payment with
weather cancellation as a first-class booking state, and reviews that only accrue from completed
on-platform bookings. Leakage in a repeat-hire industry is countered with this value, never with
policing (rule P-4).

## Operating Context

South Florida launch focus (single dense fishery; density wins in marketplaces — recommended, see
open questions). Pre-dawn dock schedules; strong seasonality (SOW v2 metrics use a trailing 3-month
average for this reason); tournament-season surge demand. Payments ride Stripe Connect Express;
hosting/infra billed directly to Client (SOW 7.iv).

## Capabilities and Constraints

Confirmed capabilities (SOW 2.i): crew/boat profiles and directory with role / port / availability
date / verified-only filters; CREW and BOAT account types; Stripe Connect Express onboarding with
delayed payout and 48h dispute window; booking state machine including CANCELLED_WEATHER; credential
upload to presigned non-public storage with admin-only verified flag; employment-language CI lint;
admin metrics dashboard; Expo mobile app at web parity.

Hard constraints (docs/COMPLIANCE.md — binding, CI-enforced where possible):
- M-1 never employment language; M-2 crew set rates, decline without penalty; M-3 no supervision
  features (no timekeeping, no task assignment, no performance management).
- P-1 Stripe owns KYC/bank/tax data — never model SSN or bank fields. P-3 fees itemized.
- V-1 `verified` is admin-set only and visually distinct from self-reported. D-1 no medical data.
  D-3 coarse location only, never live GPS.

Explicitly undecided product facts (record, don't invent): final fee structure and which side pays
(12% take rate is recommended, client undecided); cancellation-tier policy; tournament features
v1 vs v2; launch region confirmation. Attorney territory, never AI/dev-decided (G-1): ToS wording,
classification posture, insurance requirements, Jones Act, escrow characterization.

## Brand Commitments

Name: **Crew Market**. The D-2 disclaimer is verbatim and mandatory at signup, every profile, the
booking flow, and the persistent footer. Voice: calm, exact, maritime-professional; crew "offer
services," boats "book" them (M-1 vocabulary is binding). Confirmed visual direction from the
client engagement: regal, seafaring, structured utility; navy blue, crisp white, brass — realized
as the Engraved Registry system (root DESIGN.md; derivation rationale in docs/DESIGN.md).

## Evidence on Hand

Synthetic only. 25 fictional South FL crew profiles at `apps/web/data/seed-crew.json`
(generator: `scripts/generate-seed.mjs`). There are **no real customers, testimonials, ratings,
press, or usage numbers** — future work must not fabricate any, and demo surfaces must stay
labeled as synthetic (SOW 6.i).

## Product Principles

1. Marketplace, never employer — language and structure both enforce it; when a feature idea implies
   supervision or assignment, the feature is wrong.
2. Trust is shown, not claimed — verification seals, escrow states, and itemized fees are visible
   mechanisms, not marketing adjectives.
3. Crew autonomy is structural — own rates, free decline, unlimited boats; nothing penalizes saying no.
4. Weather is first-class — cancellation by weather is modeled, surfaced, and handled distinctly.
5. Outcompete leakage with value, never policing — protection and reviews exist on-platform; going
   direct is simply worse, not punished.

## Accessibility & Inclusion

No contractual standard was set in SOW v1. Working baseline shipped and to be maintained: visible
keyboard focus, prefers-reduced-motion respected, labeled form controls, semantic markup, coherent
text contrast on navy and white fields. Treat WCAG 2.2 AA as the informal bar for new surfaces.
