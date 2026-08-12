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

## Current state
- Repo scaffolded with one commit on `main`; NOT yet pushed to GitHub or run locally.
- Next steps queued: `gh repo create crew-market --private --source=. --push`; `pnpm install && cp .env.example .env.local && pnpm dev` (use `-p 3001` if fertility app holds :3000).
- First Claude Code session plan: seed ~25 synthetic FL crew profiles, build directory page with filters (role, port, date, verified-only) → demo for the client to force business-model decisions.

## Escalate to humans (never AI-decide)
ToS/booking-agreement wording, classification posture, insurance requirements, Jones Act anything, cancellation tiers, final fee structure.
