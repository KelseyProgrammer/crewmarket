# Design: Expo mobile — slice 1 (scaffold + crew-side browsing)

Date: 2026-09-05
Status: approved (decomposition + first-slice + data-source decisions made with
user; SOW 2.i "Mobile (Full Marketplace)" phase begins — parity lands across
five slices, this is slice 1)

## Decisions (made with user 9/5/2026)

- **Decomposition**: (1) scaffold + crew-side browsing → (2) auth + account →
  (3) bookings via an HTTP API → (4) credential upload → (5) boat-side parity.
  Each slice gets its own spec → plan → build cycle.
- **Data source**: a small public read-only API on apps/web, NOT bundled seed —
  mobile must never disagree with the web board about verified state.

## 1. Board API (apps/web)

- Extract the directory page's board assembly (seed profiles merged with
  `credentialOverrideMap()`) into `apps/web/lib/board-data.ts`; the directory
  page and the new route both consume it (single source of truth).
- `GET /api/board` (route handler): `{ profiles: [...] }` — all 25 merged
  profiles, public structured fields only (the `PublicCredential` boundary
  already strips `s3Key`/reviewer fields, V-2); coarse ports only (D-3);
  `Cache-Control: no-store` so admin verification appears immediately.
- No auth: this is exactly the data the public directory already renders.
- No per-profile endpoint: 25 profiles, mobile fetches once and renders
  list + detail from memory.

## 2. Expo scaffold (apps/mobile)

- Current stable Expo SDK, TypeScript, expo-router; replaces the README-only
  placeholder. Wired into the pnpm workspace (metro monorepo config), shares
  `@crewmarket/types`.
- Design tokens: `apps/mobile/lib/tokens.ts` mirroring
  `packages/ui/src/tokens.css` values (navy #0A1D30, crisp white, brass,
  spacing/type scale) with a source-of-truth pointer comment. A shared tokens
  package is deliberately deferred (YAGNI until a third consumer).
- Fonts: Oswald / Archivo / Martian Mono (or the closest expo-google-fonts
  equivalents; document any substitution).
- API base URL via `EXPO_PUBLIC_API_URL` env (dev default
  `http://localhost:3000`).

## 3. Screens — the weigh-in board world, translated to native

- **Board** (`/`): full-width rows — displayName, roles · home port, license
  class + expiry, crew-set day rate, 14-day availability strip (brass = open),
  brass seal when any credential is verified. The four SOW filters (role,
  port, availability date, verified-only) as native controls. No ordinals,
  no counts-as-ranks (M-2/P-4 structural guard carries over).
- **Profile** (`/crew/[id]`): registry-plate detail — rates ("set by the crew
  member", M-2), credentials with the verified vs self-reported distinction
  (V-1; wording verbatim from web: verification is document review, not a
  competence guarantee, V-3), fisheries/vessels/regions, next open dates,
  the D-2 disclaimer rendered on every profile, and an honest CTA: booking
  happens on the web until the bookings slice lands.
- Loading/error states: plain, honest ("Can't reach the board — check your
  connection"), retry affordance.

## 4. Compliance

- `scripts/classification-lint.mjs` already walks all of `apps/` and excludes
  `.expo` (verified 9/5) — mobile copy is inside the M-1 gate from day one;
  `pnpm compliance:check` must stay green.
- D-2 on every profile screen; M-2 rate copy; V-3 verification wording;
  no medical anything (D-1); coarse location only (D-3).

## 5. Verification

- Gates: `pnpm compliance:check`; apps/web tests/lint/build (API route);
  in apps/mobile: `tsc --noEmit` + `expo lint`, and `expo export` as a
  non-interactive bundle gate — all wired so turbo/root scripts cover them.
- Manual: simulator run against the dev server; screenshots of board +
  profile for the handoff.

## Out of scope (later slices)

Auth, bookings, credential upload, boat side, push notifications, offline
caching, shared tokens package, app-store anything.
