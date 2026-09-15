# Design: Mobile Slice 2 — Auth + Claim a Profile

Date: 2026-09-15
Status: approved in session (Better Auth Expo plugin for native auth; claim from the
profile screen; both roles sign up, crew-only claim; scope ends at auth + claim +
account status — booking management stays web this slice).

## Context

Slice 1 shipped the Expo board + registry-plate profile screens (expo-router, SDK 57),
consuming only the public `GET /api/board`. There is no mobile auth. Web auth is Better
Auth 1.3 **cookie-only** (`nextCookies()`, no bearer/Expo/JWT plugin, no `trustedOrigins`).
The `CrewProfileClaim` link (one CREW account ↔ one registry profile, 1:1 via `profileId`
@id + `userId` @unique) is created **only** by `scripts/demo-claim.mjs` — there is no
claim path in app code. The public board exposes no claim state. D-2 disclaimer is
enforced at signup by a required checkbox + the Better Auth `create.before` hook.

## 1. Server — enable native auth (`apps/web/lib/auth.ts`)

- Add dep `@better-auth/expo` (server side).
- Add `expo()` to `plugins` (alongside `nextCookies()`). This enables bearer-token auth
  for native clients; the web cookie flow is unchanged.
- Set `trustedOrigins: ["crewmarket://", "http://localhost:3000", "http://localhost:3002", "https://crewmarket-web.vercel.app"]`
  (the app scheme from `app.json` + local dev + the deployed origin). Reads from an env
  or a literal list; keep it a literal list in code for now (documented).
- No change to `additionalFields` or the D-2 `create.before` hook — mobile signup goes
  through the same handler, so the same validation and `disclaimerAcceptedAt` stamping apply.

## 2. Server — `POST /api/claim` (new, `apps/web/app/api/claim/route.ts`)

The first real claim path. Auth via the session (bearer token resolved by
`auth.api.getSession({ headers: req.headers })`). Body `{ profileId: string }`.

Rules (mirror `demo-claim.mjs`, no reassignment on this path):
1. No session → `401`.
2. `user.accountType !== "CREW"` → `403` ("Only crew accounts can claim a profile.").
3. `profileId` not in `seed-crew.json` → `404`.
4. User already has a claim (`crewProfileClaim.findUnique({ where: { userId } })`) → `409`
   ("You already drive a profile.").
5. Profile already claimed (`findUnique({ where: { profileId } })`) → `409`
   ("This profile is already claimed.").
6. **V-2 guard:** profile has any `credentialDoc` rows → `409` ("This profile has documents
   on file and can't be claimed here — contact support.") — prevents inheriting another
   person's credential docs.
7. Else `prisma.crewProfileClaim.create({ data: { userId, profileId } })` → `200 { ok, profileId }`.

Uses a plain `create` (not deleteMany+create) so concurrent double-claims collide on the
unique constraints and the second fails — a `P2002` is mapped to `409`.

## 3. Server — `GET /api/me` (new, `apps/web/app/api/me/route.ts`)

Auth via session. Signed out → `401`. Signed in → `200 { id, accountType, claimedProfileId }`
(`claimedProfileId` from `claimedProfileId(user.id)`, null if none). Returns only the
caller's own data (P-4). This is what the app uses to decide role + whether to show the
claim button. `export const dynamic = "force-dynamic"`.

## 4. Mobile — auth client (`apps/mobile/lib/auth-client.ts`)

- Deps: `better-auth`, `@better-auth/expo`, `expo-secure-store`.
- `createAuthClient({ baseURL: API_URL, plugins: [expoClient({ scheme: "crewmarket", storagePrefix: "crewmarket", storage: SecureStore })] })`.
- Export `authClient` + a `useSession` hook (Better Auth's). Session token persists in
  secure storage across app restarts.

## 5. Mobile — screens (expo-router under `apps/mobile/src/app`)

- **`sign-in.tsx`**: email + password → `authClient.signIn.email`. Link to sign-up. On
  success, back to board / account.
- **`sign-up.tsx`**: name, email, password, **role toggle CREW/BOAT**, and the **verbatim
  D-2 checkbox** (reuse `components/disclaimer-d2.tsx`, prefixed "I understand the
  following:") → `authClient.signUp.email({ ..., accountType, disclaimerAccepted: true })`.
  Required checkbox gates submit; the server hook is the backstop.
- **`account.tsx`** (session-gated; redirect to sign-in if signed out): shows name, role,
  and — for crew — the claimed profile name or a "claim your profile from the board" prompt;
  **Sign out** button (`authClient.signOut`).
- **Board header** (`src/app/_layout.tsx` or `index.tsx`): a right-side header button →
  `account` when signed in, else `sign-in`.

## 6. Mobile — claim on the profile screen (`src/app/crew/[id].tsx`)

Fetch `/api/me` (via authClient session). Show, for the current profile:
- CREW + no claim → button **"This is my profile — claim it"** → `POST /api/claim { profileId }`
  with the session; on `200` show "You drive this profile" and refresh; on `409` show the
  server message (already claimed / you already drive one).
- `claimedProfileId === this profile` → "You drive this profile."
- BOAT / signed-out / already-claimed-elsewhere → no claim button (signed-out sees a
  "sign in to claim" hint instead).

Copy is M-1 clean (no classification-banned terms); "drive this profile" matches existing web copy.

## 7. Compliance

- **D-2**: verbatim disclaimer + required checkbox on mobile signup; server hook unchanged.
- **M-1**: all new mobile + route copy passes `pnpm compliance:check`.
- **V-2**: claim refuses profiles with credential docs (guard 6).
- **P-4**: `/api/me` returns only the caller's own data; `/api/claim` returns only ok/ids;
  public board unchanged.
- **M-2/M-3**: claiming is opt-in and never gates anything; no supervision features.

## 8. Testing

- **Web unit (vitest, mocked prisma + `auth.api.getSession`, seam pattern):**
  `/api/claim` matrix — 401 signed out, 403 non-crew, 404 unknown profile, 409 user-has-claim,
  409 profile-claimed, 409 V-2 docs-present, 200 success (+ `P2002` → 409). `/api/me` — 401
  signed out, 200 shape with/without a claim.
- **Mobile:** pure logic only (vitest, `lib/`) per slice-1 convention — e.g. a helper that
  derives claim-button state from `{ session, me, profileId }`. Screens/auth I/O are
  device-verified.
- **Device pass (Expo Go, physical phone — user):** sign up (both roles, D-2), sign in,
  session persists across restart, claim a profile from its screen, account shows the claim,
  sign out. Point `EXPO_PUBLIC_API_URL` at the deployed URL or local `:3002`.
- Gates: `pnpm lint`, `pnpm compliance:check`, web + mobile vitest, `pnpm build`.

## 9. Env / deploy

- `trustedOrigins` includes `crewmarket://`, localhost, and the Vercel origin, so auth works
  against local or deployed API. Mobile `EXPO_PUBLIC_API_URL` selects which.
- `@better-auth/expo` added to web (server plugin) and mobile (client). No new secrets.
- Native fetch isn't subject to CORS; the Expo plugin + `trustedOrigins` cover auth origin
  checks. (If Expo *web* is ever built, CORS headers would be needed — out of scope.)

## Out of scope

Booking management/accept on mobile (later slice), social login, claim reassignment
(admin/script only), a web claim UI, credential uploads on mobile, push notifications,
CORS for Expo web.
