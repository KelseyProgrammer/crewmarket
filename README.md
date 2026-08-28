# Sportfishing (Enterprise) → Crew Market (Project)

Two-sided marketplace: **CREW** (mates, deckhands, licensed captains) list services & availability;
**BOATS** (private owners, charter ops, tournament programs) post jobs and book with escrowed payment.

**Identity:** a directory + booking marketplace. NOT an employer, crewing agency, or vessel operator.
Read `docs/COMPLIANCE.md` first — contractor classification (M-rules) is the product's legal spine.

Layout mirrors the fertility project: Turborepo; apps/web (Next.js 15) + apps/mobile (Expo, crew-side
mobile-first); packages/types, payments (Stripe Connect Express), ui. Docs: COMPLIANCE.md,
DATA_SCOPE in types, BUSINESS_MODEL.md (decision record incl. leakage strategy).

Quickstart: `pnpm install && cp .env.example .env.local && pnpm dev`

**Design system:** see `docs/DESIGN.md` (PFD-derived; navy/white/brass registry aesthetic).
**Contract tracking:** see `docs/SOW-AUDIT.md` (SOW v1 scope → repo status).
**Compliance gate:** `pnpm compliance:check` (M-1 employer-language lint — implemented, green).
