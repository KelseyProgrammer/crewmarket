# HANDOFF.md — Crew Market project brief (context for any new Claude chat)

**Upload this file (or the repo zip) at the start of a new conversation to restore full context.**

## Who / what
- Builder: solo dev (Mac, bash shell, Node 22.11, pnpm 9.12 installed directly — corepack is broken on this machine and must be avoided; use `npm install -g pnpm` if reinstalling).
- Client: a good friend of the builder. Product: **Crew Market** — freelance contractor directory + marketplace for sportfishing boat crew. Enterprise folder: `sportfishing/`, project: `crew-market/`.
- Prior sibling project (same conventions, separate repo): `fertility/the-app`, a donor/parent matching marketplace at github.com/KelseyProgrammer/fertility-the-app. Runs locally at ~/Projects/the-app.

## Decisions made
1. **Scope: full marketplace with payments** (not directory-only). CREW (mates, deckhands, licensed captains) list services; BOATS (private/charter/tournament) post jobs and book.
2. **Stack:** Turborepo + pnpm monorepo; apps/web = Next.js 15 App Router; apps/mobile = Expo app, slice 1 live (crew side is mobile-first — dock-at-5am usage); packages/types (Zod), packages/payments (Stripe Connect **Express** — Stripe owns KYC/bank/1099, we never store SSN/bank), packages/ui. Postgres+Prisma planned. No heavy KMS layer (no PHI) — standard PII care.
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
  account). Follow-ups (updated 2026-09-13): the orphan sweep SHIPPED —
  `node --env-file=.env.local scripts/sweep-orphan-credentials.mjs` (dry-run default, `--delete`
  to remove, 24h age gate so in-flight PUTs are never eligible, dangling DB rows report-only
  (kept report-only even after the 10/6/2026 deletion-policy call — a dangling row is a bug
  signal, not a user deletion); rehearsal-verified against MinIO;
  still pairs with the `TODO(account-deletion)` note in `schema.prisma`). UPDATE 10/7/2026:
  the real-bucket swap LANDED — production runs on Cloudflare R2 per `docs/STORAGE-SWAP.md`
  (bucket + Object-R/W scoped token + CORS; six `S3_*` vars on crewmarket-web; full V-1/V-2
  verify pass scripted against production; `ensureBucket` now HeadBucket-probes first, 32fe10c,
  because the scoped token rightly can't CreateBucket). MinIO remains the local dev store. The
  `TODO(aws)` notes in `apps/web/lib/credential-storage.ts` (region/`LocationConstraint`,
  IAM-role creds, infra-as-code bucket policy) are now the *AWS-production* track for real
  launch, not demo blockers. Now unit-tested by the 2026-09-13 hardening bundle: the credential
  server-action guards (`requireClaimedProfile` in
  `apps/web/app/account/credential-actions.ts`, `requireAdmin` in
  `apps/web/app/admin/credentials/actions.ts`) and the verified-vs-self-reported UI rendering are
  code-reviewed but not unit-tested — spec §7 items deferred pending a DB/session test harness.
- **Admin metrics dashboard SHIPPED (9/5/2026)** per
  `docs/superpowers/plans/2026-09-05-admin-metrics.md`: `/admin/metrics` live behind the same
  `ADMIN_EMAILS` gate used for `/admin/credentials`; aggregates only, nothing that ranks or lists
  individual crew (M-2/P-4) — bookings by state, verification counts, and account counts, with
  decline counts carrying an explicit non-performance note. An admin error boundary at
  `apps/web/app/admin/error.tsx` degrades to a plain retry message after hydration (errors that
  precede the first HTML flush still show a brief blank frame — inherent Next behavior), and never
  renders the underlying error (P-4). The revenue tile deliberately reads "Platform
  fees · realized" — not "net revenue" — because the figure is still booking-derived and
  dev-labeled simulated; `simulatedRevenueFromBookings()` in `apps/web/lib/admin-metrics.ts` is the
  marked SOW 7.iii swap point, and the Stripe phase replaces that one function (the tile's simulated
  flag branch flips its label at the same time figures become Stripe-derived).
  **SWAP DONE (9/15/2026)** per `docs/superpowers/specs/2026-09-15-admin-metrics-stripe-swap-design.md`
  + plan `docs/superpowers/plans/2026-09-15-admin-metrics-stripe-swap.md`: revenue is now sourced
  from Stripe **balance transactions** via `stripeRevenue()` in `packages/payments`
  (`aggregateBalanceTransactions` is the pure, unit-tested core). `AdminMetrics.revenue` is a
  discriminated union on `source`: `"stripe"` (gross platform fees retained = charges − refunds −
  crew transfers, plus available/pending balance, tile shows the money-flow) or `"simulated"` (the
  old booking-derived fallback, used when `STRIPE_SECRET_KEY` is unset OR Stripe errors — page never
  hard-crashes). Cached ~60s via `createTtlCache` (rejections not cached). Realized/held split was
  intentionally replaced by the money-flow + balance framing (balance transactions are money-movement,
  not booking-lifecycle). Live-verified 9/15 against the sandbox (figures inflated by the drive's
  test-mode top-up/probe transfers — expected noise).
- **Mobile slice 1 SHIPPED (9/5/2026)** per `docs/superpowers/plans/2026-09-05-expo-slice1.md`:
  mobile board + registry-plate profile screens (the weigh-in board world translated to native;
  tokens mirrored in `apps/mobile/lib/tokens.ts` from `packages/ui/src/tokens.css` — dual-maintenance
  until a third consumer justifies a package); public `GET /api/board` with a `toPublicProfile`
  allowlist (`avgRating`/`responseRate`/`photoRefs` deliberately never leave the server, P-4). How to
  run: `pnpm dev` (web serves the API) + `cd apps/mobile && npx expo start`; `EXPO_PUBLIC_API_URL` for
  device testing (LAN IP), `EXPO_PUBLIC_WEB_URL` exists for when web/API origins split. Device
  verification ran 9/9/2026 on a physical iPhone via Expo Go (working path: web dev + postgres
  container only, `npx expo login --browser` on the Mac + signed-in Expo Go, then
  `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npx expo start`): board loads live data, filters work.
  It caught two layout bugs the typecheck/lint/export gates could not — `<Link asChild>` (Radix
  Slot) silently destroying the board row's function-form style, and the availability strip
  overdrawing the rate text at 390pt — both fixed in d80bca0, user-confirmed on device, including
  a post-fix board→profile tap-through of the new router.push nav. Only the font-failure fallback
  remains unverified. Debt/follow-ups (updated by the 2026-09-13 hardening bundle): mobile unit
  tests now run via vitest (`lib/` pure logic only — `board.test.ts` pins the filter/window
  lockstep semantics; component behavior stays device-verified; config is `vitest.config.mts`
  because the Expo package is CJS and vite 7 is ESM-only); `/api/board` stays public by design
  (V-2/D-3/P-4) and is now per-IP rate-limited (60/min → 429 + Retry-After, live-verified) with a
  30s in-process payload cache — both per-instance and in-memory, revisit with a shared store
  before real multi-instance traffic; credential server-action guards are unit-tested (spec §7
  matrix, crew + admin — 20 tests); root `pnpm test` runs turbo test across web/ui/mobile;
  node 22.13+ wanted by react-native (`.nvmrc` pinned).
- **Mobile slice 2 BUILT (9/15/2026) — native auth + claim-a-profile** per spec
  `docs/superpowers/specs/2026-09-15-mobile-slice2-auth-claim-design.md` + plan
  `docs/superpowers/plans/2026-09-15-mobile-slice2-auth-claim.md`. Server: Better Auth **Expo
  plugin** + `trustedOrigins` (crewmarket://, localhost, Vercel) in `apps/web/lib/auth.ts`
  (cookie web flow unchanged); better-auth aligned to ^1.7.5. Two new auth-gated routes —
  **`POST /api/claim`** (the FIRST real claim path in app code; CREW-only, 1:1 uniqueness via
  `profileId @id`/`userId @unique` + P2002→409, and the **V-2 guard** refusing a profile that
  already has credential docs) and **`GET /api/me`** (`{id, accountType, claimedProfileId}`,
  own-data only, P-4). Both TDD'd (claim 8 tests, me 3). Mobile (`apps/mobile`): `@better-auth/expo`
  client with `expo-secure-store` token persistence (`lib/auth-client.ts`); native `sign-in`/
  `sign-up` (verbatim `<DisclaimerD2/>` + required checkbox → `disclaimerAccepted:true`; CREW/BOAT
  toggle) / `account` screens + a header account/sign-in entry; a **claim button on the profile
  screen** (`crew/[id].tsx`) driven by the pure, unit-tested `lib/claim-state.ts` helper
  (SIGNED_OUT/HIDDEN/CLAIMABLE/OWNED). Scope boundary: booking management stays web this slice
  (boats still deep-link to the web booking flow). All gates green; deployed to Vercel and
  live-verified (`/api/me` + `/api/claim` → 401 signed out). **NOTE:** there is now a real claim
  path, but only for UNCLAIMED profiles with no docs — reassignment is still script-only (V-2).
  typedRoutes caveat: after adding routes, `.expo/types/router.d.ts` regenerates only on
  `expo start` (not `expo export`), so a fresh checkout must run the dev server once before `tsc`.
  **DEVICE PASS PASSED 9/15** (physical iPhone, Expo Go, pointed at the deployed API): crew
  sign-up with the required D-2 checkbox → claim a profile from its screen → account names the
  claimed profile; boat account shows no claim button; session persists across an app restart.
  Two device-only bugs surfaced and fixed during the pass (gates couldn't catch either):
  (1) **`exp://` origin** — Expo Go sends origin `exp://<lan-ip>:8081`; the @better-auth/expo
  plugin only auto-trusts `exp://` when NODE_ENV==="development", so on Vercel (production) sign-up
  POSTs were rejected "Invalid origin". Fixed by adding `"exp://"` to `trustedOrigins` in
  `auth.ts` (0e9a798) — marked DEV/DEMO-ONLY, remove before a real launch (standalone builds use
  `crewmarket://`). (2) **auth-client base-path join** — `authClient.$fetch("/api/me")` prepends
  the client's `/api/auth` base → `/api/auth/api/me` → 404; fixed by calling custom routes with
  absolute URLs `${API_URL}/api/me` and `${API_URL}/api/claim` (still runs the Expo cookie +
  expo-origin onRequest hook) (eac6812). Diagnosed the 404 vs 401 from on-device `console.error`
  logging (since removed) + curl replaying the signed session cookie. Note: a few `probe-*@example.com`
  CREW test accounts exist in the Neon demo DB from curl-based debugging — harmless (no claims),
  clean up if desired. Slice 2 COMPLETE.
- **Mobile slice 3 BUILT (9/16/2026) — booking management on the phone** per spec
  `docs/superpowers/specs/2026-09-15-mobile-slice3-booking-management-design.md` + plan
  `docs/superpowers/plans/2026-09-15-mobile-slice3-booking-management.md`. Scope: manage EXISTING
  bookings (creation stays the web hand-off); Board/Bookings/Account tab bar. Server: extracted
  the money-critical event core into `apps/web/lib/booking-events.ts` `applyBookingEvent(userId,
  bookingId,event)` (role/EVENT_SIDES gate + transition + refund-first + CAS), shared by the web
  action AND four new auth-gated JSON routes — `GET /api/bookings`, `GET /api/bookings/[id]`
  (party-safe projections in `lib/booking-view.ts`; 404 non-party, `withElapsedWindow` on read),
  `POST /api/bookings/[id]/event`, `POST /api/bookings/[id]/checkout` (boat-only/ACCEPTED-only →
  Stripe Checkout url as JSON). Mobile: tab bar, bookings list, booking detail ledger with
  actions (POST /event) + boat pay (POST /checkout → `expo-web-browser` → poll for the
  webhook-confirmed funds-held). Client type mirror `apps/mobile/lib/booking-types.ts`, label
  helper `apps/mobile/lib/booking-labels.ts`. All green (lint, web+mobile+payments tests, build,
  compliance) and deployed — the four booking routes return 401 signed-out on
  crewmarket-web.vercel.app. **BUILD-FIX LESSON (cost real time): `apps/web/tsconfig.json` has
  `strict: false`, so TypeScript will NOT narrow a boolean-discriminated union (`{ok:true}|{ok:false}`)
  — vitest passes but `next build` fails. Narrow via `"error" in r`, not `!r.ok`. Always run
  `pnpm build`, not just tests.** **PROCESS LESSON: never run multiple subagents on the same
  working tree — they clobber each other (directory-wide `git add` sweeps in another's files;
  agents may not terminate at their task boundary). One agent per tree per slice, sequential.**
  **DEVICE PASS (Task 9) — user-confirmed PASSED 9/16/2026** in an interactive session (this
  supersedes the earlier fabricated-then-retracted subagent claim, 116dc32→da7b90b): Expo Go on a
  physical iPhone against the deployed Vercel API (`EXPO_PUBLIC_API_URL=https://crewmarket-web.vercel.app
  npx expo start`, no local backend needed); Metro logs corroborate an iOS bundle served during the
  run. User reported the pass good with ONE non-blocking finding (below); everything else clean.
  Watch item from Metro logs: two `WARN` "error during concurrent rendering but React was able to
  recover" lines (non-fatal, React recovered — plausibly the same incident as the finding below;
  revisit if UI glitches appear on device).
  **CONFIRMED device finding (user, 9/16): booted to sign-in once after paying via Stripe
  Checkout** — on returning from the in-app browser the first time, the app dropped to the sign-in
  screen and the user had to log back in; did not recur on later returns. Money was unaffected
  (webhook is the source of truth; booking showed funds-held after re-login).
  **FIXED (`6188fcd`, 9/16)** after root-cause reading of better-auth 1.7.5 `session-atom.mjs` +
  `@better-auth/expo` client: the guards on bookings list/detail + account treated
  `!isPending && !session` as signed-out, but that state is ALSO produced when the boot-time
  `/get-session` fails transiently (SecureStore/keychain or network hiccup during an Expo Go JS
  reload at browser-return — the failed fetch sets `error` and preserves `data`, still null on a
  cold boot before cache hydration). Discriminator: a truly signed-out user gets a SUCCESSFUL
  null get-session with NO error. Fix = TDD'd pure helper `apps/mobile/lib/auth-guard.ts`
  (CHECKING/SIGNED_IN/SIGNED_OUT/UNKNOWN, 6 tests incl. the regression case); booking screens
  proceed to their data fetch on UNKNOWN (API 401 is the authority → existing error/Retry UI),
  account shows a session Retry wired to `refetch`. The dead confirm-poll needed no fix —
  `useFocusEffect` already refetches the booking on re-entry. NOTE: fix is unit-tested +
  gates-green but NOT device-re-verified (the trigger is a transient flake, not reproducible on
  demand) — opportunistic re-check during e2e QA, and re-verify browser-return in an
  EAS/standalone build (dev Expo Go reload behavior may not carry over).
  **Slice 3 COMPLETE** (finding fixed post-pass).
- **Payments core BUILT (9/14/2026)** per spec `docs/superpowers/specs/2026-09-13-payments-core-design.md`
  (amended: Accounts v2) + plan `docs/superpowers/plans/2026-09-14-payments-core.md`. Client's
  sandbox keys live in `.env.local` (both). **Crew accounts use Stripe Accounts v2**
  (`v2.core.accounts`, recipient configuration + Express dashboard, stripe SDK ^22) because the
  client's new-generation Stripe account has the v1 Accounts API disabled (dashboard override
  needs the client's Administrator role). Everything else is v1: Checkout (card-only, two
  itemized line items per P-3), refunds, Transfers (v2 account ids interop). Webhook
  `/api/stripe/webhook` is the source of truth for ACCEPTED→ESCROW_FUNDED (sig check, paid-status
  guard, amount guard, CAS write, and auto-refund of orphaned paid sessions — duplicate-tab
  payments and pay-vs-cancel races refund themselves). Cancellations refund-first
  (`REFUND_TIERS` placeholder 1.0, G-1) with a `cancel-refund-<bookingId>` idempotency key;
  payout releases lazily on read in `withElapsedWindow`, blocked while a refund is on record.
  **Payout exactly-once = `source_transaction` (ties the transfer to the booking's charge) +
  a `transfer_group` existence check + the `stripeTransferId` null-check** — NOT a static
  idempotency key. Reason (found in the 9/14 live drive): a static `payout-<id>` key caches the
  first `balance_insufficient` failure for 24h, and separate charges & transfers leaves charge
  funds `pending` for days, so the first post-window payout reliably wedged. `source_transaction`
  makes Stripe hold the transfer until that charge settles (no wedge) and caps total transfers
  at the charge amount, so a concurrent double-read can't double-pay — guaranteed by fee < rate,
  asserted at `PLATFORM_FEE_RATE` in `packages/types/src/booking-pricing.ts`. **Live test-mode
  drive PASSED 9/14** end-to-end against the sandbox: crew Express onboarding (payouts active) →
  boat pays `4242` → webhook funds-held → weather-cancel full refund → 48h backdated → automatic
  crew payout (exactly rateCents, fee retained). Test-mode note: charge funds land in `pending`
  and `source_transaction` holds the transfer until they settle (to force it, fund available
  balance with a `tok_bypassPending` charge or the `4000000000000077` test card). ALL booking state
  writes are now CAS (`updateMany` guarded on the read state) — terminal states are sticky.
  80 unit tests across web+payments; lint/compliance/build green.
  **Run recipe (dev):** `colima start && docker compose up -d`; terminal 2:
  `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3002/api/stripe/webhook`
  (no `stripe login` needed; copy the printed `whsec_` into `STRIPE_CONNECT_WEBHOOK_SECRET` in
  both `.env.local` files if it changed); terminal 3: `PORT=3002 pnpm dev` from `apps/web`.
  Port is 3002 locally because other projects hold 3000/3001 — `BETTER_AUTH_URL` in `.env.local`
  must match. Live-drive helpers: pay with card `4242 4242 4242 4242`; Express onboarding test
  data (any name/DOB, SSN `000000000`, phone `0000000000`, Stripe's test bank);
  `node --env-file=.env.local scripts/dev-backdate-booking.mjs <bookingId> [hoursAgo=49]`
  backdates `completedAt` so the next ledger read releases the payout.
- **DEPLOYED to Vercel (client demo, 9/15/2026): https://crewmarket-web.vercel.app** (test mode).
  Vercel project `crewmarket-web` (Root Directory `apps/web`), Git-connected to
  KelseyProgrammer/crewmarket (push to main auto-deploys). Postgres = **Neon** via the Vercel
  Storage integration (injects `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_PRISMA_URL`,
  etc., all marked Sensitive so the CLI can't read them). Prisma datasource now reads Neon var
  names: `url = env("POSTGRES_PRISMA_URL")` (pooled), `directUrl = env("DATABASE_URL_UNPOOLED")`
  (migrations); locally both are set to the local Postgres in `.env.local`. Migrations run at
  build via `apps/web` `vercel-build`: `prisma migrate deploy && next build`; `packages/db`
  `postinstall: prisma generate`. **Prisma-on-Vercel gotcha (cost hours, now fixed):** the query
  engine wasn't bundled into serverless functions (pnpm hoists it to the root `.pnpm` store, and
  it loads via a runtime path static tracing can't see). Fix = `binaryTargets = ["native",
  "rhel-openssl-3.0.x"]` in schema + `outputFileTracingRoot` at repo root + `outputFileTracingIncludes`
  forcing the `.node` engine into `"/**"` (ALL routes — pages hit the DB too, not just `/api`) in
  `apps/web/next.config.mjs`. Env vars set via CLI (production): `BETTER_AUTH_SECRET` (fresh, NOT
  the local one), `BETTER_AUTH_URL=https://crewmarket-web.vercel.app`,
  `ADMIN_EMAILS=chrisament45@gmail.com`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_CONNECT_WEBHOOK_SECRET`. Live Stripe **webhook** registered via API
  (`we_1UFyBb...` → `https://crewmarket-web.vercel.app/api/stripe/webhook`,
  event `checkout.session.completed`) — replaces `stripe listen` for prod. **Demo data** seeded
  once via a temporary token-gated route (since removed): boat `boat@example.com` /
  `demo-boat-pass-1`, crew `mate@example.com` / `demo-crew-pass-1` (claimed profile **Del Pinder**,
  id ...005), plus one REQUESTED booking. NOTE: there is NO claim UI — `CrewProfileClaim` is a
  demo bridge created only by scripts/the seed route, so any new crew account can't drive a profile
  without a seeded claim. DEFERRED on the deploy: credential-doc uploads (no object store yet —
  add Cloudflare R2 via `S3_ENDPOINT`/`S3_*` env when wanted; the app degrades gracefully, uploads
  just error if attempted). To seed again, re-add a token-gated route (the removed one is in git
  history at 13d213f) — Neon vars are Sensitive so local scripts can't reach the DB directly.
- **E2e QA (G-3) — scripted drive PASSED 21/21 (9/16/2026)** per spec
  `docs/superpowers/specs/2026-09-16-e2e-qa-g3-design.md` + plan
  `docs/superpowers/plans/2026-09-16-e2e-qa-g3.md`. `scripts/e2e-booking-drive.mjs` drives the
  full Stripe test-mode lifecycle via the real authed JSON routes (Stripe/Prisma read only for
  assertions), synthetic `e2e-*` accounts: **guards** (role/party/state/CAS rejections),
  **happy path** (webhook funds-held → amount==totalCents → 48h window HOLDS payout → backdate →
  PAID_OUT, transfer exactly rateCents, fee retained, no double-pay), **refund path** (full
  weather refund on Stripe, payout permanently blocked). Report `docs/QA-G3.md`; run output
  `docs/qa/2026-09-16-g3-drive-output.txt`. **Pause-for-pay**: Stripe has no API to complete a
  hosted Checkout session and the webhook's paid-status guard is the thing under test, so a human
  pays each Checkout (`4000…0077` for A so funds settle instantly, `4242` for B) and the script
  polls the webhook. Two LIVE-RUN LESSONS baked into the script: (1) the connected-account gate
  polls the v2 `stripe_transfers` capability to **active**, NOT mere account-id presence — the id
  exists the moment "Set up payouts" is clicked while transfers stay `restricted` until the final
  Express **ToS submit** (a partial onboarding 500s the payout release with "destination account
  needs … transfers"); (2) the payout poll re-GETs the ledger route each iteration because release
  is lazy-on-read. Script uses NO stdin (harness/CI shells have no tty) — human steps are announced
  and polled for. **UI CHECKLIST COMPLETE 9/16** (`docs/qa/2026-09-16-g3-ui-checklist.md`, no
  failures): all 7 ledger states seeded locally via `demo-booking-drive.mjs`, builder-confirmed
  rendering; D-2 placement + "funds held not escrow" copy sweep grep-verified in rendered HTML
  (the only "escrow" strings are the internal `ESCROW_FUNDED` enum + derived CSS class, never
  visible prose). One walk-time "finding" (boat sees "Record trip start" on funds-held) is CORRECT,
  not a bug — trip start/complete are intentional either-party attestations (`EVENT_SIDES` =
  [BOAT, CREW], M-3 no-supervision); role-specific actions stay split. **STILL OPEN:**
  (a) **raise-a-dispute flow not built** — the 48h window-elapse is tested but there is no way to
  RAISE a dispute; dispute policy is ToS/attorney territory, escalated to the client, not
  AI-decided; (b) EAS/standalone browser-return re-check of the `6188fcd` fix.
- **SESSION SUMMARY 9/16/2026** (this session, all pushed to origin/main, tree clean): (1) Mobile
  slice 3 CLOSED — real user ran the device pass (supersedes the earlier fabricated claim); the one
  confirmed finding, a one-time boot-to-sign-in after Stripe Checkout return, was root-caused
  (guards treated a *failed* boot-time session fetch as signed-out) and FIXED in `6188fcd` (new
  TDD'd `apps/mobile/lib/auth-guard.ts`, redirect only on the authoritative signed-out answer).
  (2) E2e QA (G-3) DONE — scripted `scripts/e2e-booking-drive.mjs` PASSED 21/21 in Stripe test mode
  (guards + happy-path payout + refund) and the manual UI checklist COMPLETE, no failures; report
  `docs/QA-G3.md`. (3) Two policy questions drafted for the client in
  `docs/CLIENT-DECISIONS-2026-09-16.md` (long + two-text-message versions): the dispute-raise flow
  (attorney call) and verified-doc deletion — both escalated, not sent yet, builder is the conduit.
  Local stack (colima + compose) brought up for the QA runs and shut back down at session end.
  REMAINING: the two client answers, then build to match; EAS/standalone browser-return re-check.
- Next non-code items: relay `docs/CLIENT-DECISIONS-2026-09-16.md` to the client (dispute flow +
  verified-doc deletion), AWS/R2 swap bundle for credential storage. Optional payout
  micro-optimization (non-blocking): persist the charge id at webhook time so `releaseCrewPayout`
  skips the `paymentIntents.retrieve` on the first payout read.
- **Mobile slice 4 SHIPPED + DEVICE PASS PASSED (9/19/2026, real user):** crew credential upload native — Credentials screen
  (Account tab → claimed crew), camera/library/file sources, presigned begin→PUT→confirm reused
  via new `/api/credentials*` routes wrapping the extracted `apps/web/lib/credential-service.ts`
  (one home for V-1/V-2 guards; web actions now thin wrappers). Confirm retries are 409-safe.
  Device testing needs `S3_ENDPOINT` at the Mac's LAN IP (presigned URLs embed the signing
  host — localhost MinIO is unreachable from the phone); Vercel can't host this until the real
  AWS bucket lands.

- **SESSION SUMMARY 9/19/2026** (all pushed to origin/main, tree clean): (1) Mobile slice 4
  built end-to-end in one session — brainstorm → spec (64ee985) → plan (2996aba) → subagent
  pipeline (one implementer per task, sequential, spec-review + quality-review each, final
  cross-cutting review) → 13 code/docs commits (72b3e25..f921b51). Review loop caught and fixed:
  409-safe duplicate confirms, S3-first-delete ordering test, picker/view double-tap guards +
  uncaught-rejection handling, preflight of kind/expiry/licenseClass BEFORE the camera opens,
  no-store on the view-URL response. (2) DEVICE PASS PASSED (real user, physical iPhone):
  photo/library/PDF uploads, View, Remove, verified-badge flip. One incident root-caused: the
  `S3_ENDPOINT` LAN-IP edit sat UNSAVED in the editor, so presigned URLs pointed at localhost
  and the phone's PUT hung — lesson: `next dev` hot-reloads `.env.local`, but only from DISK.
  (3) SOW-AUDIT.md refreshed (payments ✅, admin metrics ✅, mobile 4-of-5, QA row updated).
  Dev-environment leftovers: `apps/web/.env.local` has `S3_ENDPOINT` at the Mac's LAN IP
  (fine either way); `demo-stcw-doc` left admin-verified in the dev DB (nice for demos).
  NEXT SESSION: mobile slice 5 — boat-side booking creation (brainstorm + spec first, like
  slices 3–4); then the two client policy answers, EAS build, AWS swap.

- **Mobile slice 5 BUILT + REVIEWED + PUSHED (9/22/2026) — ✅ DEVICE PASS PASSED
  (10/7/2026, real user; three findings fixed same-session — see the 10/7 device-pass
  entry below).** Boat-side booking creation went native per
  spec `docs/superpowers/specs/2026-09-22-mobile-slice5-booking-creation-design.md` + plan
  `docs/superpowers/plans/2026-09-22-mobile-slice5-booking-creation.md`; 13 code commits
  `9ee61f6..5e218e6` on origin/main (Vercel auto-deployed — POST /api/bookings is live on
  crewmarket-web.vercel.app). Subagent pipeline (one implementer per task, sequential,
  spec-review + quality-review each, final cross-cutting review) — all gates green at push
  (web 169, mobile 57, ui 12, payments 9 tests; lint/build/compliance clean).
  WHAT SHIPPED: creation guards extracted to `apps/web/lib/booking-create.ts`
  (`createBookingRequest`, 14 tests, frozen error copy; web action now a thin wrapper);
  `POST /api/bookings` (10 route tests, fresh-object shape coercion so client money fields
  can never reach the core); mobile `lib/request-form.ts` (imports the REAL computeQuote —
  no mirrored money math) + `lib/server-error.ts` (3 screens deduped); native form
  `src/app/bookings/new.tsx` (`/bookings/new?crew=<id>`, board-cache data, crew-listed trip
  types only, @react-native-community/datetimepicker 9.1.0 + app.json config plugin, itemized
  funds-held quote, P&I checkbox D-4, DisclaimerD2, verbatim web copy); profile BOOKING panel
  now a native "Request <name>" button (CREW accounts: no button; signed-out → /sign-in;
  UNKNOWN gate → button shows, API is authority); stale "(Demo build: …simulated)" trimmed
  from the web crew page. REVIEW-LOOP CATCHES worth knowing: (1) core date guard hardened —
  regex + UTC round-trip, so Feb 31/month-13 now 400 cleanly (this also CHANGED WEB behavior
  for impossible dates — improvement, previously roll-over/throw); (2) POST days coercion
  converged on the web action (`Number()`; garbage → NaN → core 400 — never a silent 1-day
  booking); (3) **Android date-dialog cancel used to write "today" into the form** — fixed
  with an `event.type === "set"` guard (device-verifiable only on Android — WATCH ITEM for
  the EAS build, builder's iPhone can't test it); (4) form seeds startDate to TODAY (iOS
  compact picker shows today but fires no event for the default — so unlike web, a boat can
  submit without touching the date; deliberate, confirm UX on device).
  **DEVICE PASS CHECKLIST (physical iPhone, Expo Go, deployed API:
  `EXPO_PUBLIC_API_URL=https://crewmarket-web.vercel.app npx expo start` from apps/mobile):**
  (1) boat@example.com: profile shows "Request <name>" → form opens; (2) trip-type switch
  updates quote, multi-day stepper math right; (3) date starts seeded TODAY — submit once
  WITHOUT touching the date (should book today; confirm UX acceptable); (4) pick a date next
  month — no off-by-one; (5) P&I unchecked blocks Send, checking enables; (6) Send → native
  ledger REQUESTED; (7) mate@example.com sees the request in bookings list, spot-check
  Accept; (8) crew account on a profile: no button, copy renders; (9) signed out: Request →
  sign-in. Watch: iOS picker may visibly adjust on first tap (seeded value is midnight, floor
  is "now") — note if odd. ALSO ride along: one request from the WEB form on dev or prod
  (verifies the Task-2 wrapper end-to-end — the only unverified gate).
  AFTER THE PASS (done 10/7): this block updated, `docs/SOW-AUDIT.md` mobile row → 5 of 5
  (closes plan Task 7); findings and fixes recorded in the 10/7 device-pass entry below.
  Non-blocking notes: sign-in still drops the booking intent (lands on /account — same as
  claim; app-wide `from`-param fix is backlog); pnpm-lock carried an inert better-call zod
  peer-resolution flip from the install; brass button now hand-rolled 3× (extract when a 4th
  appears). NEXT AFTER SLICE 5 CLOSES: the remaining client policy answer
  (docs/CLIENT-DECISIONS-2026-09-16.md — dispute-raise flow; attorney territory, stays
  escalated), EAS build (re-verify browser-return 6188fcd + Android picker cancel),
  AWS/R2 credential-storage swap (runbook ready in docs/STORAGE-SWAP.md).

- **Verified-doc deletion policy DECIDED + SHIPPED (10/6/2026):** option (c) from
  docs/CLIENT-DECISIONS-2026-09-16.md §2, chosen under the client's standing delegation —
  crew can still remove any document (verified included), but removing a VERIFIED doc now
  retains a metadata-only `CredentialDocDeletion` row (doc id, profile, uploader, kind,
  licenseClass, expiry, uploadedAt, verifiedAt/byEmail, deletedAt — never the document,
  s3Key, or content fields, V-2; no User relation so the record survives account deletion).
  Audit create + row delete ride one transaction in `deleteDoc`
  (apps/web/lib/credential-service.ts); migration `20261007023802_credential_doc_deletion_audit`
  (applies on deploy via vercel-build's `prisma migrate deploy`). Owners are told:
  mobile/web-demo Remove confirm says the record is kept (`removeConfirmMessage`,
  apps/mobile/lib/credential-labels.ts), web credentials lede gets a conditional sentence
  when a verified doc exists. Self-reported docs delete with no trace, unchanged. The
  dispute-raise flow (§1) remains the one open client decision.

- **Mobile slice 5 DEVICE PASS PASSED (10/7/2026, real user, physical iPhone + Expo Go
  against production API):** all 9 checklist steps + the web-form ride-along (step 10 —
  the Task-2 thin-wrapper path verified end-to-end in production, last unverified slice-5
  gate closed). Step-3 seeded-today submit confirmed acceptable UX. THREE FINDINGS, all
  fixed and re-verified on device same-session: (1) iOS compact date-picker popover stayed
  open after a pick — no imperative close exists, so a key remount dismisses it; chip also
  gained a "Tap the date to change it" hint (components/date-field.tsx). The chip's light
  grey is SYSTEM-rendered (Apple tertiarySystemFill) — a branded replacement field is
  deferred to the design-polish pass. (2) Sign-out "freeze" was never a network bug —
  signOut() resolved success:true, but tab screens stay mounted and the Account screen's
  `signingOut` latch was never reset, so revisiting the tab spun forever with the
  redirect suppressed; redirect also fired from the UNFOCUSED mounted tab (navigation
  hijack — the reason the latch existed). Fix: redirect now runs under `useFocusEffect`
  via pure `shouldRedirectToSignIn` (lib/auth-guard.ts, +5 tests, mobile suite 66→71),
  latch resets in `finally`. (3) Sign-in/sign-up are reached via `replace()` — no back
  stack, tabs hidden — an inescapable wall off the PUBLIC board; both screens gained a
  "Just browsing? View the board" escape link. All gates green (tsc, 71 mobile tests,
  expo lint, M-1 compliance).
  **SEQUENCING DECIDED 10/7 (user):** a dedicated mobile DESIGN-POLISH pass runs NEXT as
  its own spec'd project (client-side verdict during the pass: mobile UI reads flat /
  under-differentiated vs the web's weigh-in-board treatment; Impeccable + PFD per
  CLAUDE.md design-tooling section; the branded date-field replacement rides in it) —
  then the EAS standalone build LAST, so the client's first binary ships the polished UI.

## Escalate to humans (never AI-decide)
ToS/booking-agreement wording, classification posture, insurance requirements, Jones Act anything, cancellation tiers, final fee structure.
