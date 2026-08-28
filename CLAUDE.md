# CLAUDE.md — Crew Market (enterprise: Sportfishing)

## Role & product truth
Senior engineer on a two-sided marketplace: CREW (mates, deckhands, captains) offer services;
BOAT owners/captains book them. We are a **directory + booking marketplace — NOT an employer,
crewing agency, or vessel operator**. Contractor-classification discipline is the top compliance
concern: see docs/COMPLIANCE.md and cite rule IDs (M-*, V-*, P-*, D-*, G-*) in commits.

## Hard constraints
1. Never generate employer language (M-1): no "employee", "wages", "we hire", "our crew", <!-- cl-allow: rule definition quotes banned terms -->
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

## Design tooling (vendored + install commands)
The visual system is derived and documented in `docs/DESIGN.md` — treat it as the design context
file (audience, palette, type, signature element). Tooling that produced/maintains it:
1. **Perception-First Design (PFD)** — vendored at `.claude/skills/pfd/` (SKILL.md + framework +
   corpus; CC BY-SA 4.0, Stefan Kovalik). Canonical install if re-adding:
   `/plugin marketplace add skovalik/perception-first-design` then
   `/plugin install perception-first-design@perception-first-design`.
   Use Mode 2 (derivation) for new surfaces; Mode 1 (evaluate) to audit built pages.
2. **Intent (UX strategy system)** — not vendored (17 skills, large). Install:
   `/plugin marketplace add ghaida/intent` (Claude Code) or `npx skills add ghaida/intent --all`.
   Used for: anti-pattern catalog (no dark patterns — pairs with rule P-4), UX copy discipline.
3. **Impeccable (design craft + anti-slop detector)** — vendored at `.claude/skills/impeccable/`
   (Apache 2.0, Paul Bakaus; compiled plugin build @ ea36002, 2026-08-28). Canonical install:
   `npx impeccable skills install` from repo root (CLI ≥2.3 renamed `install`/`update` to
   `skills install`/`skills update`), then `/impeccable init` in-agent. The design detector hook
   is toggled in-agent via `/impeccable hooks on|off|status` — enabled for this project 8/28/2026
   (shared `.impeccable/config.json`; per-machine consent + Claude Code manifest are gitignored,
   so each new machine re-runs `/impeccable hooks on` once).
   CI idea: `npx impeccable detect apps/web/` alongside `pnpm compliance:check`.
Root `PRODUCT.md` (impeccable product-schema) and root `DESIGN.md` (DESIGN.md format spec, tokens + eight sections) are pre-written from the signed SOW and repo docs — `/impeccable init` should be a confirmation pass, not a fresh interview; `/impeccable document` should treat root DESIGN.md as the incumbent record. Design changes must still pass `pnpm compliance:check` (M-1) — copy rules outrank aesthetics; the lint now also scans root-level md.

pnpm dev / build / lint; pnpm compliance:check (M-1 gate — implemented, keep green)
