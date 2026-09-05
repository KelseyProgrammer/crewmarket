# apps/mobile — Expo (React Native)

Crew-side companion app for the Crew Market marketplace. The crew-side UX is
mobile-first: availability toggles, listing alerts, and quick accept/decline
on booking requests are the north star for later slices. This app shares
`@crewmarket/types` (workspace package) with the web app so the two clients
never drift on shape.

**Node:** react-native's engine range wants `^22.13.0`+ (repo `.nvmrc` pins
22.13.0). Older 22.x currently works with warnings — upgrade before
native-module-heavy slices.

Scaffolded with `create-expo-app@latest` (TypeScript + expo-router default
template, Expo SDK 57). Routes live under `src/app` (the current create-expo-app
default layout, not a top-level `app/`).

## Status

Slice 1 of 5 (see `docs/SOW-AUDIT.md`): scaffold only. `src/app/index.tsx` is a
placeholder — the crew board and profile screens land in the next tasks of
`docs/superpowers/plans/2026-09-05-expo-slice1.md`.

## Design tokens

`lib/tokens.ts` mirrors `packages/ui/src/tokens.css` (the source of truth —
update both, or extract a shared package once a third consumer appears).

## Scripts

- `pnpm start` — `expo start`
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — `expo lint`
- `pnpm export` — `expo export --platform ios` (proves the bundle compiles)

## Running against the API

`lib/api.ts` reads `EXPO_PUBLIC_API_URL`, defaulting to
`http://localhost:3000` (the web app's `pnpm dev`). Set
`EXPO_PUBLIC_API_URL` when testing from a physical device on the same network.
