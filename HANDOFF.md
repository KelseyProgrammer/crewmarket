# HANDOFF.md — Crew Market project brief (context for any new Claude chat)

**Upload this file (or the repo zip) at the start of a new conversation to restore full context.**

## Who / what
- Builder: solo dev (Mac, bash shell, Node 22.11, pnpm 9.12 installed directly — corepack is broken on this machine and must be avoided; use `npm install -g pnpm` if reinstalling).
- Client: a good friend of the builder. Product: **Crew Market** — freelance contractor directory + marketplace for sportfishing boat crew. Enterprise folder: `sportfishing/`, project: `crew-market/`.
- Prior sibling project (same conventions, separate repo): `fertility/the-app`, a donor/parent matching marketplace at github.com/KelseyProgrammer/fertility-the-app. Runs locally at ~/Projects/the-app.

## Decisions made
1. **Scope: full marketplace with payments** (not directory-only). CREW (mates, deckhands, licensed captains) list services; BOATS (private/charter/tournament) post jobs and book.
2. **Stack:** Turborepo + pnpm monorepo; apps/web = Next.js 15 App Router; apps/mobile = Expo placeholder (crew side is mobile-first — dock-at-5am usage); packages/types (Zod), packages/payments (Stripe Connect **Express** — Stripe owns KYC/bank/1099, we never store SSN/bank), packages/ui. Postgres+Prisma planned. No heavy KMS layer (no PHI) — standard PII care.
3. **Business model (recommended, client undecided):** free crew listings, free boat browsing, ~12% take rate on bookings via escrow (fund at booking, payout after trip + 48h dispute window). Known weakness: platform leakage in a repeat-hire industry — countered by value (escrow, weather-cancellation cover, verified credentials, on-platform-only reviews), never by policing. Open questions for client in docs/BUSINESS_MODEL.md (launch region — recommend single dense fishery like South FL; fee side; tournament features v1/v2).
4. **Compliance spine: contractor classification** (docs/COMPLIANCE.md, rule IDs M/V/P/D/G). Marketplace, NOT employer/crewing agency/vessel operator. Structural crew autonomy (own rates, free decline, no supervision features), employer-language CI lint (stub at scripts/classification-lint.mjs), credential verification (USCG/STCW/TWIC, admin-only `verified` flag, presigned doc storage), insurance attestation, Jones Act flagged as attorney territory. Booking state machine includes CANCELLED_WEATHER as first-class.
5. **Conventions:** CLAUDE.md at repo root (auto-read by Claude Code); commits tagged `[ai-assisted]` + rule IDs; synthetic seed data only; work on feature branches, main protected.

## Current state (post design-refinement session, 8/28/2026)
- **SOW v1 signed 8/27/2026** ($4,000 fixed fee, cash-only; see `docs/SOW-AUDIT.md` for the live scope→repo gap map).
- **Design system built** per `docs/DESIGN.md`: PFD-derived (perception-first-design skill) + Intent-audited. Regal seafaring / structured utility; navy `#0A1D30`, crisp white `#F8FAFB`, brass `#A9822F`. Fonts: Libre Caslon Display / Archivo / IBM Plex Mono. Signature: brass verification seal on "registry plate" crew cards.
- **Working & verified (`next build` green):** landing page (chart-field hero, booking trail), directory with all four SOW filters (role, port, availability date, verified-only) server-rendered from seed data, D-2 disclaimer in persistent footer, `packages/ui` components (CrewCard, VerifiedSeal, DisclaimerD2, BookingStateBadge).
- **Seed data:** 25 synthetic South FL crew profiles (SOW 2.i) — deterministic generator `scripts/generate-seed.mjs` → `apps/web/data/seed-crew.json`.
- **Booking state machine implemented:** `packages/types/src/booking-machine.ts` — typed transitions, CANCELLED_WEATHER first-class, 48h `DISPUTE_WINDOW` → `PAID_OUT`.
- **classification-lint implemented** (was stub — exceeds SOW): `pnpm compliance:check` scans copy for M-1 employment-implying language, understands the negated D-2 disclaimer, `cl-allow` escape marker. Currently green.
- Next steps: push to GitHub; then auth + role shells → Stripe Connect Express (largest phase) → booking UI on the state machine → credential upload/admin verify → admin metrics dashboard (SOW v2 bonus data source) → Expo mobile parity → e2e QA (G-3).

## Escalate to humans (never AI-decide)
ToS/booking-agreement wording, classification posture, insurance requirements, Jones Act anything, cancellation tiers, final fee structure.
