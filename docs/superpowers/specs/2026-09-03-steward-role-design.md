# Design: STEWARD crew role (client request)

Date: 2026-09-03
Status: approved (client asked for a "stewardess option"; neutral industry form
"Steward(ess)" chosen with user approval — enum value `STEWARD`)

## What

Add a seventh crew role, `STEWARD`, displayed as **Steward(ess)**, everywhere the
role list appears:

1. `packages/types/src/index.ts` — add `"STEWARD"` to the `CrewRole` z.enum.
2. `packages/ui/src/components.tsx` — `ROLE_LABELS.STEWARD = "Steward(ess)"`.
3. `apps/web/app/crew/[id]/page.tsx` — same label in the page-local label map.
4. `apps/web/app/directory/page.tsx` — add `["STEWARD", "Steward(ess)"]` to the
   role filter list.
5. `scripts/generate-seed.mjs` — add `STEWARD` to `ROLES` and to the non-deck
   primary-role bucket so ~2 of 25 synthetic profiles are stews; add
   interior-oriented synthetic bios; regenerate `apps/web/data/seed-crew.json`.

## Decisions

- **Label**: "Steward(ess)" — the industry-neutral form; satisfies the client's
  "stewardess" ask without a gendered title (pairs with P-4 copy discipline).
- **No new credential kinds** (YAGNI): existing `STCW_BASIC`, `CPR_FIRST_AID`,
  `OTHER` cover interior crew.
- **No schema migration**: roles are strings validated by the Zod enum.
- **Seed churn accepted**: the deterministic PRNG stream shifts when the role
  arrays change, so unrelated synthetic profiles move in the diff. All data is
  synthetic (G-1), so this is harmless.

## Compliance

Day rates remain crew-set within the existing synthetic band (M-2). No employer
language introduced (M-1); `pnpm compliance:check` must stay green. Verify with
`pnpm compliance:check`, `pnpm lint`, `pnpm build`.
