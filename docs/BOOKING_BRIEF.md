# BOOKING_BRIEF.md — Confirmed design brief: Booking Flow ("The Voyage Ledger")

> Confirmed by the builder 8/28/2026 after PFD Mode-2 derivation + /impeccable shape.
> Build starts 8/29/2026. This is the surface brief for the SOW "Booking Flow" phase (15–25h).
> Derivation rationale (R1–R5 with citations) summarized in §PFD below; visual system: root DESIGN.md.

**Mode: Operate.** Both parties complete a task; scanability and state clarity outrank expression.

## Confirmed scope decisions

1. **Direct bookings only** — boat requests a specific crew member from their profile. JobPost board is a later phase.
2. **Simulated funds-held step** — a clearly dev-labeled demo control fires `ESCROW_CONFIRMED` exactly where the Stripe PaymentIntent will slot in (payments is its own SOW phase, 30–50h; Stripe keys come from the client per SOW 6.i).
3. **Full flow, both roles** — request form on crew profiles, crew accept/decline, shared ledger with all states, per-account bookings lists.

## The thesis (from PFD derivation)

**One canonical booking document, not three UIs.** A registry-style ledger card per booking,
identical for both parties, rendered in three contexts: the full document (`/bookings/[id]`),
a role-conditional action slot at its foot, and a phone-compressed crew view. Focal moment:
the lit "Funds held" step carrying a brass-edged held-funds object with the computed release
date. Because both strangers watch the same artifact, symmetry itself does compliance work —
the platform is visibly the ledger-keeper, not the boss.

## PFD requirements (satisfy all; lower layers win conflicts)

- **R1 (L0):** one current state + one action per party per screen; crew request resolves on one
  phone screen in ≤5 chunks (boat, dates, rate, accept, decline). Cowan 2010; Hick 1952.
- **R2 (L1):** the funding moment is the most institutional screen in the product; held funds are
  a visible object, not a status string. Lindgaard 2006; Fogg 2003.
- **R3 (L2):** every state renders through the existing component language (BookingStateBadge,
  plates, mono furniture, two-finish brass); zero new hues/components; CANCELLED_WEATHER is
  informational navy, never error styling; identical vocabulary on both sides. Reber & Schwarz 1999; Wertheimer 1923.
- **R4 (L3):** itemized fee appears on the request screen — no new numbers at funding; money
  location continuously visible (held → trip → 48h review → payout, release date computed via
  `payoutReleasable`); weather terms visible before funding, sourced to the agreement. Kahneman & Tversky 1979; Clark 2013.
- **R5 (L4):** one brass action per state per role, outcome-labeled ("Accept — Sep 12 · $650");
  decline is an equal ghost with zero confirm friction and zero penalty copy (M-2 evidence);
  TRIP_START/COMPLETE are attestations, never clock-ins (M-3); agreement names boat + crew (M-4).
  Thaler & Sunstein 2008; Pirolli & Card 1999; Green & Swets 1966.

## Layout & interaction

Ledger top-to-bottom: mono eyebrow (`VOYAGE Nº · dates · port`) → the two named parties
(platform visibly not one of them) → money block (rate + itemized fee, same numbers from request
onward) → vertical trail, exactly one lit step (10 machine states collapse to: Requested →
Accepted → Funds held → Underway → 48h review → Paid out; three cancellations as terminal
information panels) → action slot. Request form: date(s), trip type, auto-computed money block
(rate derives mechanically from crew-listed rates × trip type × days — no negotiation in v1),
P&I attestation checkbox (D-4), D-2, agreement note. Bookings list: registry index rows
(eyebrow, counterparty, dates, BookingStateBadge). Reduced motion respected; AA via brass-text.

## States to build

Six trail steps + three terminal cancellation panels + PAID_OUT; empty lists (both roles);
unauthorized/wrong-role access; invalid transition (stale tab) handled by re-rendering current
state; dispute window shows computed release time.

## Binding constraints & open decisions (builder must not invent)

- **Copy law: user-facing text says "funds held" / "delayed payout" — NEVER "escrow".**
  SOW 2.ii/6.i: escrow characterization is unresolved attorney territory; the signed contract
  itself only says "delayed payout"/"funds held". Internal identifiers (`ESCROW_FUNDED`) are
  fine — they never render. M-1 lint stays green; crew *offer services*, boats *book*.
- **Fee:** itemized (P-3) from one config constant — default 12% boat-side per BUSINESS_MODEL
  recommendation; side and % are OPEN client decisions; UI renders whatever config says.
- **Cancellation refund tiers:** OPEN (attorney, G-1) — the ledger points to the per-booking
  agreement as the source; no invented percentages.
- **Crew identity gap:** seed profiles aren't owned by CREW accounts. Use a minimal demo claim
  link (e.g., `claimedByUserId` on a profile, mapped to mate@example.com) so the crew side is
  drivable; full crew onboarding is a later phase.
- D-2 in the flow completes the **last contractually required disclaimer placement**.
- Build ON the state machine (`canTransition`/`transition`) — never modify it.
- Anti-goals: nothing that scores/ranks/nags crew about declining; no urgency mechanics; no
  red-alarm cancellation styling; no chat/negotiation.
