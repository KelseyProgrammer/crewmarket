# Crew Market

A two-sided marketplace for the sportfishing industry. **Crew** — mates, deckhands,
and licensed captains — list their services, credentials, and availability. **Boats** —
private owners, charter operations, and tournament programs — post jobs and book crew,
with payment held until the trip is done.

> **Live demo:** [crewmarket-demo.vercel.app](https://crewmarket-demo.vercel.app) —
> the mobile app running in the browser (test mode, synthetic data). Click through the
> job board, crew profiles, and booking flow.

## What it is — and what it isn't

Crew Market is a **directory and booking marketplace**. It is not an employer, a
crewing agency, or a vessel operator. Crew are independent contractors: they set their
own rates, accept or decline any job without penalty, and work with as many boats as
they choose. The platform introduces the two sides, facilitates payment, and steps back.

That distinction is not just legal positioning — it is enforced in code and CI. See
[Compliance by design](#compliance-by-design).

## How a booking works

1. **Crew list services** — day rate, home port, availability, and structured
   credentials (USCG license class and expiry, STCW, CPR/First Aid, TWIC).
2. **Boats post a job or book directly** from the board.
3. **Funds are held at booking** through Stripe Connect.
4. **Crew are paid out after the trip**, once a 48-hour dispute window closes.
5. **Both sides review each other** — peer-to-peer marketplace reviews, accrued only
   on-platform.

## Architecture

Turborepo + pnpm monorepo:

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 app — boat-side browsing, booking, admin |
| `apps/mobile` | Expo app — crew side is mobile-first; also exports the web demo |
| `packages/types` | Zod schemas, the shared data contract |
| `packages/db` | Prisma schema and client (Postgres, encrypted at rest) |
| `packages/payments` | Stripe Connect integration (funds held, delayed payouts, fees) |
| `packages/ui` | Shared UI components |

Decisions worth noting:

- **Stripe Connect Express** owns identity verification, payout rails, and tax forms.
  Crew onboard directly with Stripe; the platform never stores SSNs or bank numbers.
- **Credential documents are treated as PII**: private S3-compatible storage
  (MinIO locally), encrypted at rest, presigned-URL access only, never logged.
  A credential's `verified` flag can only be set by an admin check — self-reported
  and verified credentials are visually distinct in the UI.
- **Location is coarse by design** (home port, current region) — never live GPS.

## Getting started

Prerequisites: Node (version in `.nvmrc`), pnpm 9, Docker.

```bash
docker compose up -d        # Postgres 17 + MinIO (local object storage)
pnpm install
cp .env.example .env.local  # then fill in Stripe test keys
pnpm dev
```

| Script | Purpose |
|---|---|
| `pnpm dev` | Run all apps in dev mode |
| `pnpm build` | Build everything |
| `pnpm lint` / `pnpm test` | Lint and test across the workspace |
| `pnpm compliance:check` | Classification-language lint (see below) — kept green in CI |

All seed data is synthetic.

## Compliance by design

The central legal risk in this product is **contractor misclassification** — a
marketplace drifting into an employment-style relationship with the people who use it.
The rules that prevent that live in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) as
numbered engineering constraints, cited by ID in commit messages:

| Prefix | Covers |
|---|---|
| `M-*` | Marketplace identity — language discipline, crew autonomy, no supervision features |
| `V-*` | Credentials and verification honesty |
| `P-*` | Payment holds, payouts, and tax boundaries |
| `D-*` | Data, privacy, and mandatory disclaimers |
| `G-*` | Launch gates (attorney review, end-to-end Stripe tests) |

Two examples that shape the codebase, not just the copy: bookings move through trip
states only — there are no timekeeping, task-assignment, or performance-management
features (M-3) — and `pnpm compliance:check` fails CI if employment-flavored language
lands in copy or docs (M-1).

## Documentation

| Doc | Contents |
|---|---|
| [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) | The rule set above, in full |
| [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md) | Fee model, payment-hold flow, and the marketplace-leakage strategy |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system — navy/white/brass "registry" aesthetic and its derivation |
| [`docs/WEB-DEMO.md`](docs/WEB-DEMO.md) | How the Expo app ships as a shareable web demo |
| [`docs/SOW-AUDIT.md`](docs/SOW-AUDIT.md) | Contracted scope mapped to repo status |
| [`docs/STORAGE-SWAP.md`](docs/STORAGE-SWAP.md) | Runbook for moving credential-document storage between S3-compatible providers |

## Status

Active development. The web demo is live; Stripe flows run in test mode. Attorney
review of terms, the booking agreement, and classification posture is a hard launch
gate (G-1) — this README is engineering documentation, not legal advice.
