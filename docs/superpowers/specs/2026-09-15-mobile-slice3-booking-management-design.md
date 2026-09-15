# Design: Mobile Slice 3 — Booking Management

Date: 2026-09-15
Status: approved in session; **build deferred** (spec only — pick up later). Scope
decided: manage EXISTING bookings on the phone (creation stays the web hand-off);
add a bottom tab bar. Booking payment via Stripe Checkout in an in-app browser.

## Context

Slices 1–2 shipped: the Expo board + registry-plate profile screens, native auth
(Better Auth Expo plugin, secure-store token), and crew profile claiming. All
booking lifecycle logic today runs through Next.js **server actions** (`"use server"`,
form-bound, cookie session, `redirect`/`revalidatePath`) in
`apps/web/app/bookings/actions.ts` — **not callable from a native app**. There is no
booking JSON API. The state machine (`@crewmarket/types`) and payments
(`@crewmarket/payments`) are shared packages, reusable server-side as-is.
`apps/web/lib/bookings.ts` has `sessionUser`, `partyRoleFor`, `claimedProfileId`,
`bookingsForUser`, and `withElapsedWindow` (lazy payout-on-read — must run on every
booking read; there is no cron).

## Guiding decisions

- **Manage existing bookings only.** List + detail + every lifecycle action native:
  crew accept/decline/start/complete, either-side cancels, and the boat pay step.
  Booking **creation** stays the existing web hand-off from the crew profile screen
  (`crew/[id].tsx` → `${WEB_URL}/bookings/new?crew=<id>`).
- **Bottom tab bar**: Board / Bookings / Account.
- **Payment**: open the Stripe Checkout URL in `expo-web-browser`; on return, re-fetch
  and briefly poll the booking for the webhook-confirmed `ESCROW_FUNDED` (never trust
  the redirect — the webhook is the source of truth). Open-browser + poll-on-return;
  no extra web "bridge" page.

## 1. Server refactor — extract the event core (DRY, money-critical)

Extract the body of `bookingEventAction` into a shared server function so the web
action and the new API route can't drift:

`apps/web/lib/booking-events.ts`:
```ts
export type ApplyResult =
  | { ok: true; state: BookingState }
  | { ok: false; status: number; error: string };

// Loads the booking, resolves partyRoleFor, enforces EVENT_SIDES, runs transition,
// refund-first on cancel states, CAS updateMany({ where: { id, state: from } }).
// NO redirect/revalidate — pure logic + prisma. Returns the new state or a typed error.
export async function applyBookingEvent(
  userId: string, bookingId: string, event: BookingEventType,
): Promise<ApplyResult>
```
- `bookingEventAction` (web) becomes a thin wrapper: call `applyBookingEvent`, then
  `revalidatePath`. Its existing behavior (incl. the `TRIP_COMPLETE` → `PAYOUT_SCHEDULED`
  chaining and refund-first ordering) is preserved by moving the code verbatim.
- The existing `actions.test.ts` cases for `bookingEventAction` retarget to
  `applyBookingEvent` (same assertions, direct call — simpler, no form binding).

## 2. New auth-gated API routes (template: `/api/me`, `getSession({headers})`)

Every list/detail route runs each booking through `withElapsedWindow` (payout release
happens only on read). All return `{ error }` JSON bodies with proper status codes
(the mobile `serverError()` helper reads `error.error`). `export const dynamic = "force-dynamic"`.

- **`GET /api/bookings`** — wraps `bookingsForUser(userId, role)`. Returns a party-safe
  summary array: `{ id, state, role, counterpartyName, dates, totalCents }`.
  Counterparty: for BOAT → crew profile `displayName` (from seed); for CREW → boat
  user `name`. 401 if signed out; empty array if none.
- **`GET /api/bookings/[id]`** — `partyRoleFor` → 404 if not a party (never reveal
  existence to non-parties). Returns detail: state, role, parties, `rateCents`,
  `feeCents`, `totalCents`, timestamps, dates, `tripType`, refund/transfer/payout info
  as the web ledger shows, **plus `availableEvents: BookingEventType[]`** — the events
  the caller may fire now, computed server-side from `EVENT_SIDES` ∩ `canTransition(state, e)`
  (so the phone never re-implements the gate) and the `paid=pending` suppression of
  Hold-funds.
- **`POST /api/bookings/[id]/event`** — body `{ event }`. Calls `applyBookingEvent`;
  returns `{ ok, state }` or `{ error }` + status. The route re-checks the event is in
  the caller's allowed set (applyBookingEvent already enforces this).
- **`POST /api/bookings/[id]/checkout`** — boat-only, state must be `ACCEPTED` → returns
  `{ url }` (Stripe Checkout Session) as JSON. Reuses `createBookingCheckout`. Return
  URLs stay the web ledger (`?paid=pending`) — the mobile ignores the landing and polls.

## 3. Mobile — navigation + screens (`apps/mobile`)

- **Tabs** (expo-router `(tabs)` group): **Board** (current `index`), **Bookings**
  (new), **Account** (current). `crew/[id]`, `sign-in`, `sign-up` remain stack screens
  outside the tabs. Navy/brass styling; the header account/sign-in entry is replaced by
  the Account tab. Tab bar hidden or a "Sign in" prompt when signed out (bookings/account
  tabs redirect to sign-in when no session).
- **Bookings list** (`(tabs)/bookings.tsx`): `authClient.$fetch<...>(`${API_URL}/api/bookings`)`
  (ABSOLUTE url — the auth client prepends `/api/auth` to relative paths). Rows: state
  badge (reuse the web `STATE_LABELS` vocabulary — "Funds held", never "escrow"),
  counterparty, dates, total; tap → detail. Role-aware empty states (incl. "your account
  isn't linked to a board profile yet" for unclaimed crew).
- **Booking detail** (`bookings/[id].tsx` as a stack screen, pushed from the list): the
  native Voyage Ledger — state trail, money block (rate + itemized fee + total via
  `fmtUsd`), parties, and one brass action button per allowed event (from
  `availableEvents`). A pure `eventLabel(event, booking)` helper (unit-tested) maps event
  → copy ("Accept booking", "Decline", "Hold funds — $X", "Start trip", "Trip complete",
  "Cancel — weather", "Cancel booking"). Actions POST to `/event`, then re-fetch.
- **Payment** (boat, ACCEPTED): tap Hold funds → POST `/checkout` → `WebBrowser.openBrowserAsync(url)`
  → on dismiss, set a "confirming payment…" state and poll `GET /api/bookings/[id]`
  every ~2s (cap ~5 tries) until state is `ESCROW_FUNDED` (or stop and let a manual
  refresh finish). Copy avoids "escrow" (G-1).

## 4. Compliance

- **M-1 / G-1**: all new copy passes `pnpm compliance:check`; user-facing money language
  is "funds held" / "payout", never "escrow".
- **P-4**: booking projections expose only counterparty name + booking facts — no
  ratings, photos, or response rates; 404 (not 403) for non-parties so existence isn't
  revealed.
- **M-2 / M-3**: the `EVENT_SIDES` gate is enforced server-side in `applyBookingEvent`;
  declining a booking carries no penalty and no supervision/assignment features appear.
- **P-2**: `withElapsedWindow` runs on every booking read via the API routes, so the 48h
  delayed-payout release still fires.

## 5. Testing

- **Server unit (vitest, seam-mocked prisma + session):** `applyBookingEvent` (role
  gate, invalid-event no-op, refund-first on cancel, CAS lost-race, TRIP_COMPLETE chain)
  — moved from the current `actions.test.ts` + extended. New route tests: `/api/bookings`
  (401, list shape, role branch), `/api/bookings/[id]` (404 non-party, detail shape,
  `availableEvents` correctness), `/event` (dispatch + error mapping), `/checkout`
  (boat-only, non-ACCEPTED rejected, returns url).
- **Mobile pure-logic (vitest, lib/):** `eventLabel`, and any action-derivation helper.
  Screens are device-verified per the slice-1/2 convention.
- **Device pass (Expo Go, physical phone — user):** as crew, accept then start then
  complete a booking; as boat, pay via Checkout and confirm the funds-held flip; cancel
  a booking (refund path); confirm the tab bar + list + detail render and role-gate
  correctly. Point `EXPO_PUBLIC_API_URL` at the deployed URL or local `:3002`.
- Gates: `pnpm lint`, `pnpm compliance:check`, web + mobile vitest, `pnpm build`.

## 6. Deploy

The new API routes deploy with the web app to Vercel (auto-deploy on push to main).
The mobile app hits them via `EXPO_PUBLIC_API_URL`. No new env, no new secrets. The
`exp://` trustedOrigins dev allowance already covers Expo Go auth.

## Out of scope

Booking **creation** on mobile (stays web hand-off), native Stripe payment sheet (no
Stripe SDK on mobile — Checkout URL only), push notifications for booking state changes,
disputes beyond the 48h window, real-time updates (poll/refresh only), Expo web CORS.

## Build sequencing (for the later session)

1. Extract `applyBookingEvent`; retarget existing tests; keep web action green.
2. `GET /api/bookings` + `GET /api/bookings/[id]` (+ projection helpers) — TDD.
3. `POST /api/bookings/[id]/event` + `POST /api/bookings/[id]/checkout` — TDD.
4. `eventLabel` pure helper — TDD.
5. Mobile tab-bar restructure.
6. Bookings list screen.
7. Booking detail screen + actions + payment-via-browser + poll.
8. Full verification + deploy the routes.
9. Device pass (user).
