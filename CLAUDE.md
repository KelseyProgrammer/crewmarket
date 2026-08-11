# CLAUDE.md — Crew Market (enterprise: Sportfishing)

## Role & product truth
Senior engineer on a two-sided marketplace: CREW (mates, deckhands, captains) offer services;
BOAT owners/captains book them. We are a **directory + booking marketplace — NOT an employer,
crewing agency, or vessel operator**. Contractor-classification discipline is the top compliance
concern: see docs/COMPLIANCE.md and cite rule IDs (M-*, V-*, P-*, D-*, G-*) in commits.

## Hard constraints
1. Never generate employer language (M-1): no "employee", "wages", "we hire", "our crew",
   no features that assign, supervise, or penalize declining work (M-2, M-3).
2. Crew set their own rates; platform never mandates pricing (M-2).
3. Stripe Connect Express owns KYC/bank/tax data — never model SSN or bank fields (P-1).
4. Credential docs: private storage, presigned access, `verified` flag is admin-set only (V-1, V-2).
5. No medical/health fields of any kind (D-1). Coarse location only, never live GPS (D-3).
6. Disclaimer D-2 placement: signup, every profile, booking flow.
7. Synthetic seed data only; commit style: `[ai-assisted]` + rule IDs.

## Architecture
Turborepo + pnpm: apps/web (Next.js 15), apps/mobile (Expo placeholder, crew-side is mobile-first),
packages/types (Zod schemas), packages/payments (Stripe Connect), packages/ui.
Postgres + Prisma (encrypted at rest); AWS S3 presigned for credential docs.

## Escalate to a human
ToS/booking-agreement wording, classification questions, insurance requirements, Jones Act anything,
cancellation-tier policy, fee structure changes.

## Commands
pnpm dev / build / lint; pnpm compliance:check (M-1 gate — currently stub, implement early)
