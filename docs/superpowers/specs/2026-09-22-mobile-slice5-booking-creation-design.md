# Design: Mobile Slice 5 — Boat-Side Booking Creation

**Date:** 2026-09-22
**Status:** Approved (brainstorm session 9/22; scope, parity, and architecture options
each confirmed by the builder)
**Predecessors:** slice 3 (booking management native, web hand-off for creation),
slice 4 (credential upload; service-extraction pattern this slice reuses)

## Context

Booking *creation* is the last core flow that leaves the mobile app: the crew profile
screen's BOOKING panel deep-links boats out to the web form at
`/bookings/new?crew=<id>` (`apps/mobile/src/app/crew/[id].tsx`, drawn with the
"provisional" dashed hairline per DESIGN.md). Everything downstream — bookings list,
ledger, state actions, Stripe Checkout pay — has been native since slice 3.

Server-side, creation logic lives only in the web server action
`createBookingAction` (`apps/web/app/bookings/actions.ts`): BOAT-only, crew profile
lookup, trip type restricted to crew-listed rates, server-side quote recompute (R4),
required P&I attestation (D-4), then `prisma.booking.create` into REQUESTED. There is
no `POST /api/bookings` — the route file only has GET.

Two facts discovered in exploration that shape the design:

1. **Mobile already imports `@crewmarket/types` directly** (labels, api, booking
   screens). The money math (`computeQuote`, `tripTypesFor`, `maxDaysFor`, `fmtUsd`,
   `PLATFORM_FEE_RATE`, `PLATFORM_FEE_SIDE`, `TRIP_TYPE_LABELS`) needs **no mirror** —
   the native form uses the exact functions the web form uses, preview-only.
2. **The board feed already carries the rates** (`toPublicProfile` allowlist ships
   `dayRateUsd`/`halfDayRateUsd`/`tournamentRateUsd`), and the profile screen reads
   from the module-level board cache (`lib/board.ts` `cachedBoard()`/`getBoard()`).
   The request screen reads the same cache — no new data endpoint, and the form can
   never disagree with the board (same fetch).

## Guiding decisions (confirmed with builder)

- **Native form fully replaces the web hand-off.** The `Linking.openURL` bridge, the
  "runs on the web for now" copy, and the provisional dashed styling all go away.
- **Strict parity with the web form.** Same fields, same validation, same copy laws.
  A platform date picker is a platform control, not a feature change. No availability
  hints, no book-again shortcut (candidates for later slices, both surfaces at once).
- **Extract a shared creation core** (slice-4 `credential-service.ts` pattern): one
  home for the money-adjacent guards; the web action and the new JSON route are both
  thin wrappers.

## 1. Server refactor — extract the booking-creation core

New `apps/web/lib/booking-create.ts`:

```ts
export type CreateBookingInput = {
  crewProfileId: string;
  tripType: string;
  startDate: string;   // YYYY-MM-DD
  days: number;
  piAttested: boolean;
};

export type CreateBookingResult =
  | { booking: Booking }
  | { error: string; status: 400 | 403 };

export async function createBookingRequest(
  user: { id: string; accountType?: string },
  input: CreateBookingInput
): Promise<CreateBookingResult>
```

Guard order (verbatim from today's action, same error copy):

1. `accountType !== "BOAT"` → `{ error: "Only boat accounts send booking requests.", status: 403 }`
2. `crewProfileById(input.crewProfileId)` missing → 400 "Unknown crew profile."
3. `tripType` not in `TRIP_TYPES` or not in `tripTypesFor(crew)` → 400
   "Choose a trip type this crew member lists a rate for."
4. `startDate` fails `/^\d{4}-\d{2}-\d{2}$/` → 400 "Pick a start date."
5. `days` coerced to 1 when `maxDaysFor(tripType) === 1`; `computeQuote` null → 400
   "Days must be between 1 and `maxDaysFor(tripType)`." (R4: quote recomputed from
   crew-listed rates — client math never trusted.)
6. `!piAttested` → 400 "Confirm the vessel carries P&I coverage for this trip." (D-4:
   the request cannot exist without the attestation; `piAttestedAt` stamped at create.)
7. `prisma.booking.create` → REQUESTED (schema default), `dates: datesFrom(...)`,
   `rateCents`/`feeCents` from the recomputed quote → `{ booking }`.

`createBookingAction` becomes a thin wrapper: session check → FormData →
`createBookingRequest` (`piAttested: formData.get("piAttested") === "on"`) → on error
return `{ error }` (unchanged form UX), on success `revalidatePath` + `redirect` as
today.

**strict:false lesson (slice 3, cost real time):** `apps/web/tsconfig.json` has
`strict: false`, so narrow the result union via `"error" in r` — never `!r.ok`-style
boolean discrimination. Run `pnpm build`, not just vitest, before claiming green.

## 2. New route — `POST /api/bookings`

Added to the existing `apps/web/app/api/bookings/route.ts` (GET stays untouched):

- No/invalid session → 401 `"sign in required"` (same body as the sibling routes).
- Malformed JSON body / missing fields → 400 `{ error }` (Zod-or-manual shape check;
  `days` must arrive as a number, `piAttested` as a boolean).
- `createBookingRequest` error → its `status` with `{ error }` JSON (the mobile
  client surfaces this copy verbatim, slice-2 `serverError` pattern).
- Success → **201** `{ id: booking.id }`. The client navigates to the ledger and
  fetches the party-safe projection from `GET /api/bookings/[id]` — the raw booking
  row never crosses the wire (P-4).

## 3. Mobile screen — `src/app/bookings/new.tsx`

Route `/bookings/new?crew=<id>` (static segment wins over the sibling `[id]`
dynamic route in expo-router — no collision). Stack-presented like `bookings/[id]`,
not a tab.

- **Data:** profile from `cachedBoard() ?? getBoard()` (cold-start deep-link safe,
  same convergence comment as the profile screen). Missing id → humanized not-found
  state (slice-4 copy discipline).
- **Auth gate:** guards follow `lib/auth-guard.ts` semantics — redirect to sign-in
  only on the authoritative SIGNED_OUT answer; on UNKNOWN proceed and let the API
  401 drive the error/Retry UI. Non-BOAT accounts never reach this screen from the
  profile entry point, but a direct deep link by a CREW account simply gets the
  server's 403 copy inline.
- **Form, mirroring the web `RequestForm` section-for-section:**
  - Trip-type plates — only `tripTypesFor(profile)`, rendered with the existing
    role-fork plate pattern (sign-up screen) restyled per tokens.
  - Date — `@react-native-community/datetimepicker` (**the one new dependency**,
    installed via `npx expo install` for SDK-57 pinning), `minimumDate` today
    (platform affordance; the server accepts any well-formed date, unchanged).
    Stored as `YYYY-MM-DD`.
  - Days — stepper (− / count / +) shown only when `maxDaysFor(tripType) > 1`,
    clamped 1..`maxDaysFor` (10).
  - **The money block** — itemized: crew line (`fmtUsd(quote.rateCents)`), platform
    fee line with `PLATFORM_FEE_RATE`/`PLATFORM_FEE_SIDE` rendered exactly as the web
    copy does (P-3), total line "Held at booking, released after the trip + 48h
    review". Quote from `computeQuote` — preview only (R4).
  - **P&I attestation** — required checkbox, verbatim web sentence (D-4), same
    checkbox pattern as the D-2 sign-up checkbox.
  - Agreement note ("…Crew Market keeps the ledger and holds the funds; it is not a
    party to the agreement…") and the M-3 line ("declining never costs crew anything
    on Crew Market") verbatim.
  - Submit — brass button, label `Send request — <total> held at booking` when the
    quote and date are set; disabled until `canSubmit`; double-tap guarded (slice-4
    V-2 lesson generalized); `authClient.$fetch` with the **absolute URL**
    `${API_URL}/api/bookings` (slice-2 base-path lesson).
- **Success:** `router.replace(/bookings/<id>)` — the existing native ledger renders
  REQUESTED. Replace (not push) so back from the ledger returns to the profile, not
  a stale form.
- **Errors:** server `{ error }` inline under the submit via the `serverError`
  helper; network failure → inline message, form state preserved, submit re-enabled.

Pure form logic lives in **`apps/mobile/lib/request-form.ts`** (unit-tested):
given `(rates, tripType, days, startDate, piAttested)` → `{ offered, effectiveDays,
quote | null, canSubmit, payload }`. Components stay thin per house rule.

**typedRoutes caveat (slice 2):** after adding the route, `.expo/types/router.d.ts`
regenerates only on `expo start` — run the dev server once before `tsc` on a fresh
checkout.

## 4. Profile-screen entry point

In `crew/[id].tsx`, the BOOKING panel:

- Loses `panelProvisional` (dashed = "lives elsewhere"; it no longer does), the
  web-link `Pressable`, `bookingLinkError` state, and the "Booking runs on the web
  for now" copy. Verified: the deep-link is `WEB_URL`'s only importer — drop the
  import (and `Linking` if then unused) but KEEP the `WEB_URL` export in
  `lib/api.ts`; it is the documented hook for a future web/API origin split.
- Panel copy becomes the web profile's BOOKING paragraph (payment held at booking,
  fee itemized up front, weather cancellation first-class, 48h window, "<first name>
  accepts or declines every request at their sole discretion") — minus the "(Demo
  build: the funds-held step is simulated…)" parenthetical. Verified: the web page
  still carries it at `apps/web/app/crew/[id]/page.tsx:162` and it has been stale
  since payments went live — trim it there too as part of this slice.
- Button logic from the session + `me` state the screen already fetches for the
  claim flow:
  - Signed-in BOAT (`me.accountType === "BOAT"`) → brass "Request <firstName>" →
    `router.push("/bookings/new?crew=" + profile.id)`.
  - Signed out (no session) → same button label, routes to `/sign-in` (claim-link
    pattern).
  - Signed-in CREW → copy only, no button (M-2: crew don't request crew).
  - Session state UNKNOWN (transient fetch failure) → show the button; the request
    screen's own gate + API 401 are the authority (auth-guard discipline).

## 5. Compliance

- **M-1/M-3:** all copy verbatim from the shipped web form — "funds held", never
  "escrow"; free-decline line present; no supervision or penalty language.
- **M-2:** trip types render only from crew-listed rates; the platform neither sets
  nor suggests a rate anywhere on the screen.
- **P-3:** fee itemized as its own line, rate/fee/total from the one shared config.
- **D-4:** attestation required client-side AND enforced in the shared core — the
  booking row cannot exist without `piAttestedAt`.
- **R4/P-4:** client quote is preview-only, server recomputes; POST returns only the
  booking id; the form's crew data is the public board allowlist.
- `pnpm compliance:check` green (verified: the lint's `INCLUDE_DIRS` walks all of
  `apps/`, so mobile copy is in scope).

## 6. Testing

- **TDD the core** (`apps/web/lib/booking-create.test.ts`), guard matrix mirroring
  the claim-route style: non-BOAT 403; unknown crew, unoffered trip type, bad date,
  out-of-range days, missing attestation → 400 with the exact copy; happy path
  creates REQUESTED with recomputed `rateCents`/`feeCents` and stamped
  `piAttestedAt`; client-sent money fields (if smuggled into the body) are ignored.
- **Route tests** (`route.test.ts` additions): 401 signed out, 403 crew account,
  400 malformed body, 201 + `{ id }` happy path; GET untouched (existing tests keep
  passing).
- **Web action:** existing behavior covered by the core tests; the wrapper is
  redirect/revalidate glue — verified by build + a manual web smoke (send one
  request from the web form on dev).
- **Mobile unit tests** (`lib/request-form.test.ts`): offered-trip filtering,
  single-day coercion, days clamping, quote null on bad days, `canSubmit` truth
  table, payload shape.
- **Gates:** `pnpm lint`, `pnpm test` (web + mobile + ui), **`pnpm build`**,
  `pnpm compliance:check`.
- **Device pass (real user, physical iPhone, deployed or LAN API):** boat signs in →
  profile shows "Request <name>" → form: trip-type switch updates the quote, multi-
  day stepper math correct on screen, P&I unchecked blocks submit → send → lands on
  the native ledger in REQUESTED; crew account sees no button; signed-out tap lands
  on sign-in; the request appears on the crew side's bookings list. (Accept/decline
  and pay are slice-3 surface — spot-check accept only.)

## Out of scope

- Availability-date hints or conflict warnings on the form (later, both surfaces).
- "Request again" prefill from a past booking.
- Any change to the accept/decline/pay flows, the state machine, or pricing.
- Rate negotiation (v1 rule: quote derives mechanically from listed rates, M-2).
- Web `/bookings/new` UI changes (it silently benefits from the extracted core).
- EAS/standalone build work (separate open item).
