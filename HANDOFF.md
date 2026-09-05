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
5. **Conventions:** CLAUDE.md at repo root (auto-read by Claude Code); commits tagged `[ai-assisted]` + rule IDs; synthetic seed data only; committing directly to main is fine (client confirmed 9/3/2026).

## Current state (post design-refinement session, 8/28/2026)
- **SOW v1 signed 8/27/2026** ($4,000 fixed fee, cash-only; see `docs/SOW-AUDIT.md` for the live scope→repo gap map).
- **Design system built** per `docs/DESIGN.md`: PFD-derived (perception-first-design skill) + Intent-audited. Regal seafaring / structured utility; navy `#0A1D30`, crisp white `#F8FAFB`, brass `#A9822F`. Fonts: Libre Caslon Display / Archivo / IBM Plex Mono. Signature: brass verification seal on "registry plate" crew cards.
- **Working & verified (`next build` green):** landing page (chart-field hero, booking trail), directory with all four SOW filters (role, port, availability date, verified-only) server-rendered from seed data, D-2 disclaimer in persistent footer, `packages/ui` components (CrewCard, VerifiedSeal, DisclaimerD2, BookingStateBadge).
- **Seed data:** 25 synthetic South FL crew profiles (SOW 2.i) — deterministic generator `scripts/generate-seed.mjs` → `apps/web/data/seed-crew.json`.
- **Booking state machine implemented:** `packages/types/src/booking-machine.ts` — typed transitions, CANCELLED_WEATHER first-class, 48h `DISPUTE_WINDOW` → `PAID_OUT`.
- **classification-lint implemented** (was stub — exceeds SOW): `pnpm compliance:check` scans copy for M-1 employment-implying language, understands the negated D-2 disclaimer, `cl-allow` escape marker. Currently green.
- **Pushed to GitHub** (8/28/2026): https://github.com/KelseyProgrammer/crewmarket — origin over HTTPS via `gh` (SSH key is passphrase-locked; `gh auth setup-git` configured as credential helper).
- **Phase 1 Accounts & Roles built** (8/28/2026): Better Auth 1.7 (email/password) + `packages/db` (Prisma 6 / Postgres, Better Auth core tables + `accountType` CREW|BOAT + `disclaimerAccepted(At)` for D-2). Sign-up (role fork, required verbatim D-2 checkbox, server-side hook rejects without it and stamps time), sign-in, middleware cookie gate, `/account` role-branched shell with honest "next on the build" copy. Local DB: colima + docker compose (`docker-compose.yml`, postgres:17-alpine, db `crewmarket_dev`, user/pass `crewmarket`). Docker Desktop is NOT installed — use `colima start` first. `.env.local` (root + apps/web, gitignored) carries DATABASE_URL/BETTER_AUTH_SECRET; `packages/db/.env` symlinks root `.env.local` for the Prisma CLI.
- **Booking flow designed & confirmed (8/28/2026):** PFD-derived "Voyage Ledger" concept — one shared booking document, both roles, all states. Confirmed brief at `docs/BOOKING_BRIEF.md` (scope: direct bookings only; simulated funds-held step until client's Stripe keys arrive; full breadth). **Build starts 8/29/2026.** Critical copy law from the signed SOW: user-facing text says "funds held"/"delayed payout", NEVER "escrow" (escrow characterization is attorney territory, SOW 2.ii/6.i). Also this session: PFD audit 76→81 (brass-text AA token split, crew profile pages w/ D-2, pre-launch hero note); impeccable design hook enabled project-wide.
- **Weigh-in board world SHIPPED (9/1/2026):** client locked Probe C and the full plan
  (`docs/superpowers/plans/2026-09-01-directory-weigh-in-board.md`) executed same day. Directory is
  now full-width board rows (no cards, no ordinals — M-2/P-4 guard is structural + tested), Oswald/
  Archivo/Martian Mono via next/font, AvailabilityStrip wired (brass fill = open day), 26px brass
  seal coin, row hover inverts navy with staggered strip motion. 12 ui tests, compliance lint, and
  build all green. Impeccable finish review ran (fix round → all 7 resolved → ship); root DESIGN.md
  rewritten from the built world; PFD Mode-2 addendum in docs/DESIGN.md §4. Probe source survives
  only in artifact `caf986f4` (tab C). Watch item: 10px masthead nav links at 390px.
- **Booking UI (Voyage Ledger) SHIPPED (9/2/2026)** per docs/BOOKING_BRIEF.md + plan
  `docs/superpowers/plans/2026-09-02-booking-ui-voyage-ledger.md`: request form on crew profiles
  (client quote preview, server-side recompute, P&I attestation D-4), shared ledger `/bookings/[id]`
  (vertical trail, one lit step, brass-edged held-funds object w/ computed release, terminal panels,
  role-gated action slot, dev-labeled simulated funds-held), bookings index, account shell wired.
  "Funds held" vocabulary throughout — escrow never renders (verified in built HTML). Demo drive:
  `node --env-file=.env.local scripts/demo-booking-drive.mjs` seeds 7 states + demo accounts
  (boat@example.com / mate@example.com, passwords in script output; mate drives "Del Pinder").
  NOTE: db-push drift consolidated 9/4 into migration `20260904000000_booking_and_profile_claim`
  (marked applied on dev DB; `prisma migrate status` clean). All states screenshot-verified except ESCROW_FUNDED/IN_PROGRESS/
  PAID_OUT ledger details + wrong-role/empty-list guards (code-reviewed; full pass is e2e QA, G-3).
- **Credential verification SHIPPED (9/4/2026)** per `docs/superpowers/plans/2026-09-04-credential-verification.md`:
  crew upload docs on `/account` (begin → presigned PUT → confirm, with a server-side HeadObject
  re-validation before the row is trusted); admin verify at `/admin/credentials` (unlinked from nav),
  gated by an `ADMIN_EMAILS` env allowlist that also blocks those emails from self-signup; claimed
  profiles and the directory board now surface live DB credential state (`verifiedAt` = admin-set
  only, V-1) — profile pages switched from static generation to per-request rendering to read it,
  so `generateStaticParams` was dropped there. Ops: MinIO runs in `docker-compose.yml`
  (`docker compose up -d`, alongside postgres); `S3_*` and `ADMIN_EMAILS` vars live in `.env.local`
  (see `.env.example`); demo drive `node --env-file=.env.local scripts/demo-credential-drive.mjs`
  seeds one synthetic self-reported STCW doc through the real storage path onto the existing claimed
  profile. `scripts/demo-claim.mjs` now refuses to reassign a claim away from a profile with uploaded
  docs unless `--force-docs` is passed (V-2: a reclaim must never hand a stranger's documents to a new
  account). Three follow-ups on the books, not blocking: an S3 lifecycle/orphan sweep for uploads that
  call begin but never confirm (pairs with the `TODO(account-deletion)` note in `schema.prisma`), the
  AWS-swap TODOs left in `apps/web/lib/credential-storage.ts` (region/`LocationConstraint`,
  IAM-role creds instead of static keys, bucket security config) for when the client's real bucket
  replaces MinIO, and the credential server-action guards (`requireClaimedProfile` in
  `apps/web/app/account/credential-actions.ts`, `requireAdmin` in
  `apps/web/app/admin/credentials/actions.ts`) and the verified-vs-self-reported UI rendering are
  code-reviewed but not unit-tested — spec §7 items deferred pending a DB/session test harness.
- **Admin metrics dashboard SHIPPED (9/5/2026)** per
  `docs/superpowers/plans/2026-09-05-admin-metrics.md`: `/admin/metrics` live behind the same
  `ADMIN_EMAILS` gate used for `/admin/credentials`; aggregates only, nothing that ranks or lists
  individual crew (M-2/P-4) — bookings by state, verification counts, and account counts, with
  decline counts carrying an explicit non-performance note. An admin error boundary at
  `apps/web/app/admin/error.tsx` degrades to a plain retry message rather than the framework crash
  page, and never renders the underlying error (P-4). The revenue tile deliberately reads "Platform
  fees · realized" — not "net revenue" — because the figure is still booking-derived and
  dev-labeled simulated; `simulatedRevenueFromBookings()` in `apps/web/lib/admin-metrics.ts` is the
  marked SOW 7.iii swap point, and the Stripe phase replaces that one function (the tile's simulated
  flag branch flips its label at the same time figures become Stripe-derived).
- Next steps: Stripe Connect Express (request test keys from client) → Expo mobile parity →
  e2e QA (G-3).

## Escalate to humans (never AI-decide)
ToS/booking-agreement wording, classification posture, insurance requirements, Jones Act anything, cancellation tiers, final fee structure.
