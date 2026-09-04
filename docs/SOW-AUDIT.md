# SOW-AUDIT.md — Repo state vs. Signed SOW v1 (8/27/2026)

> Living gap analysis. Update the Status column as phases land. Statuses: ✅ done · 🟡 partial · ⬜ not started.

## Section 2.i scope → repo mapping

| SOW Phase | Contract requirement | Status | Where / notes |
|---|---|---|---|
| Directory & Search | Crew/boat profile data model | ✅ | `packages/types` (Zod: CrewProfile, BoatProfile) |
| | Directory listing page | ✅ | `apps/web/app/directory/page.tsx` |
| | Filters: role, port, availability date, verified-only | ✅ | GET-form filters, server-rendered (zero client JS) |
| | Seed ~25 synthetic South FL crew profiles | ✅ | `scripts/generate-seed.mjs` → `apps/web/data/seed-crew.json` (deterministic, synthetic — SOW 6.i) |
| Accounts & Roles | Auth + CREW/BOAT account creation | ✅ | Better Auth (email/password) + Prisma/Postgres (`packages/db`); sign-up with CREW/BOAT fork and required D-2 checkbox (`apps/web/app/sign-up`) |
| | Role-based views/permissions | 🟡 | `/account` shell branches by accountType, middleware cookie gate + server session check; booking actions role-gated (9/2). Remaining: crew profile-edit + admin permissions |
| Payments (Stripe Connect Express) | Express onboarding, delayed payout, 48h dispute window, webhooks | 🟡 | `packages/payments` documented API surface + booking machine encodes ESCROW_FUNDED → COMPLETED → DISPUTE_WINDOW(48h) → PAID_OUT. Stripe calls not yet wired (needs client's Stripe keys — SOW 6.i) |
| Booking Flow | State machine incl. CANCELLED_WEATHER first-class | ✅ | `packages/types/src/booking-machine.ts` — typed transition table + guards |
| | Boat request/accept, crew accept/decline | ✅ | Voyage Ledger shipped 9/2: request form (`/bookings/new`), shared ledger (`/bookings/[id]`, role-gated actions), bookings index. Funds-held step simulated until Stripe keys |
| Credential Verification | Presigned non-public storage | ⬜ | Schema ready (`docRef`, V-2); S3 wiring pending |
| | Admin-only `verified` flag | 🟡 | Enforced in schema comments + seed models it; admin UI pending |
| | Verified badge on profiles | ✅ | Brass-seal badge on directory cards (V-1 visual distinction, V-4 license class at a glance) |
| Compliance Scaffolding | Employer-language CI lint stub | ✅⁺ | **Exceeds SOW**: `scripts/classification-lint.mjs` fully implemented (was stub), wired to `pnpm compliance:check` |
| | Structural crew-autonomy safeguards | ✅ | No supervision/assignment features exist; rates crew-set in schema (M-2/M-3) |
| Admin Metrics Dashboard | Net revenue, bookings, verified counts | ⬜ | Depends on Stripe + auth; data shape defined by types |
| Mobile (Full Marketplace) | Expo app, feature parity | ⬜ | `apps/mobile` placeholder; shares `@crewmarket/types` when initialized |
| Deployment & QA | Env setup, e2e of booking + payments | 🟡 | `.env.example` present; e2e after payments wiring |

## Contract obligations embedded in the build (not just features)

- **D-2 disclaimer placement** (COMPLIANCE.md, mirrors SOW 6.i client representation): verbatim disclaimer renders in the persistent footer of every page, on the directory, and as a required signup checkbox (acceptance timestamped server-side on the user record), on every crew profile page (`apps/web/app/crew/[id]`), and in the booking flow (explicit render on `/bookings/new` and `/bookings/[id]`, 9/2). All required placements now live.
- **Synthetic data only** (SOW 6.i): seed generator produces fictional names/stats; no real crew data anywhere in repo.
- **Secrets discipline** (SOW 8.iii): `.env.example` only; nothing committed.
- **Admin dashboard = SOW v2 bonus metric source** (SOW 7.iii): keep net-revenue figures Stripe-derived, never hand-entered, when built.
- **Out of scope, do not build** (SOW 2.ii): ToS wording, escrow-characterization analysis, manual credential review tooling beyond the flag, marketing site.

## Suggested build order to acceptance (Section 4.i)

1. Auth + role-gated shells (unlocks 3 blocked phases)
2. Stripe Connect Express onboarding + escrow intent + webhook handler (largest estimated phase, 30–50h)
3. Booking UI on top of the state machine
4. Credential upload (presigned S3) + admin verify toggle
5. Admin metrics dashboard (Stripe reporting reads)
6. Expo mobile app (parity pass) — largest remaining phase, 45–65h
7. QA end-to-end in Stripe test mode (G-3), deliver per Section 3
