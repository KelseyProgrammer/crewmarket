# Mobile Slice 3 — Booking Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Manage existing bookings on the Expo app — a Board/Bookings/Account tab bar, a bookings list + detail ledger, every lifecycle action native, and boat payment via Stripe Checkout in an in-app browser. Per `docs/superpowers/specs/2026-09-15-mobile-slice3-booking-management-design.md`.

**Architecture:** Booking logic today is Next server actions (not native-callable). Extract the money-critical event core into a shared `applyBookingEvent()` used by both the web action and new auth-gated JSON routes (`GET /api/bookings`, `GET /api/bookings/[id]`, `POST .../event`, `POST .../checkout`). Every list/detail read runs `withElapsedWindow` (lazy payout-on-read). Mobile restructures to expo-router tabs and adds list + detail screens; payment opens the Checkout URL in `expo-web-browser` and polls for the webhook-confirmed funds-held.

**Tech Stack:** Next 15 route handlers, `@crewmarket/types` (state machine), `@crewmarket/payments`, vitest (seam-mocked prisma+session), Expo SDK 57 / expo-router tabs, expo-web-browser.

**Compliance:** M-1/G-1 (copy; "funds held" never "escrow"), P-4 (party-safe projection, 404 non-parties), M-2/M-3 (EVENT_SIDES server-gated; decline penalty-free), P-2 (`withElapsedWindow` on read). Cite rule IDs in commits.

**CRITICAL mobile rule (slice-2 lesson):** `authClient.$fetch` prepends its `/api/auth` base to RELATIVE paths → 404. ALL custom-route calls MUST use absolute urls: `authClient.$fetch(`${API_URL}/api/bookings...`)`.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/web/lib/booking-events.ts` | `applyBookingEvent()` + `EVENT_SIDES`/`TIMESTAMPS` + `availableEventsFor()` (create) |
| `apps/web/lib/booking-events.test.ts` | event-core tests (moved from actions.test.ts + extended) (create) |
| `apps/web/app/bookings/actions.ts` | `bookingEventAction` becomes a thin wrapper (modify) |
| `apps/web/lib/booking-view.ts` | party-safe `toBookingSummary`/`toBookingDetail` projections (create) |
| `apps/web/app/api/bookings/route.ts` | `GET /api/bookings` (create) |
| `apps/web/app/api/bookings/route.test.ts` | (create) |
| `apps/web/app/api/bookings/[id]/route.ts` | `GET /api/bookings/[id]` (create) |
| `apps/web/app/api/bookings/[id]/route.test.ts` | (create) |
| `apps/web/app/api/bookings/[id]/event/route.ts` | `POST .../event` (create) |
| `apps/web/app/api/bookings/[id]/event/route.test.ts` | (create) |
| `apps/web/app/api/bookings/[id]/checkout/route.ts` | `POST .../checkout` (create) |
| `apps/web/app/api/bookings/[id]/checkout/route.test.ts` | (create) |
| `apps/mobile/lib/booking-labels.ts` | pure `eventLabel()` + state labels (create) |
| `apps/mobile/lib/booking-labels.test.ts` | (create) |
| `apps/mobile/src/app/(tabs)/_layout.tsx` | tab bar (create) |
| `apps/mobile/src/app/(tabs)/index.tsx` | board (moved) |
| `apps/mobile/src/app/(tabs)/bookings.tsx` | bookings list (create) |
| `apps/mobile/src/app/(tabs)/account.tsx` | account (moved) |
| `apps/mobile/src/app/bookings/[id].tsx` | booking detail + actions + payment (create) |
| `apps/mobile/src/app/_layout.tsx` | root stack registers (tabs) + stack screens (modify) |

---

### Task 1: Extract `applyBookingEvent` (refactor; keep web green)

**Files:** create `apps/web/lib/booking-events.ts`, create `apps/web/lib/booking-events.test.ts`, modify `apps/web/app/bookings/actions.ts`.

- [ ] **Step 1: Create `apps/web/lib/booking-events.ts`** — move `EVENT_SIDES`, `TIMESTAMPS`, and the core logic (currently `actions.ts` lines 150–211) into a pure-ish server function. No `redirect`/`revalidatePath`.

```ts
import "server-only";
import { prisma } from "@crewmarket/db";
import { isCancelState, refundBookingPayment, refundCentsFor } from "@crewmarket/payments";
import { canTransition, transition, type BookingEvent, type BookingState } from "@crewmarket/types";
import { partyRoleFor, type PartyRole } from "./bookings";

export type UserEvent = Exclude<
  BookingEvent["type"],
  "PAYOUT_SCHEDULED" | "DISPUTE_WINDOW_ELAPSED" | "ESCROW_CONFIRMED"
>;

/** Which side may fire which event. TRIP_START/TRIP_COMPLETE are attestations either
    party may record — never supervision (M-3). */
export const EVENT_SIDES: Record<UserEvent, PartyRole[]> = {
  CREW_ACCEPT: ["CREW"],
  CREW_DECLINE: ["CREW"],
  CANCEL_BOAT: ["BOAT"],
  CANCEL_CREW: ["CREW"],
  CANCEL_WEATHER: ["BOAT", "CREW"],
  TRIP_START: ["BOAT", "CREW"],
  TRIP_COMPLETE: ["BOAT", "CREW"],
};

const TIMESTAMPS: Partial<Record<UserEvent, "acceptedAt" | "fundsHeldAt" | "tripStartedAt">> = {
  CREW_ACCEPT: "acceptedAt",
  TRIP_START: "tripStartedAt",
};

/** Events the given role may fire from the given state right now. */
export function availableEventsFor(state: BookingState, role: PartyRole): UserEvent[] {
  return (Object.keys(EVENT_SIDES) as UserEvent[]).filter(
    (e) => EVENT_SIDES[e].includes(role) && canTransition(state, e),
  );
}

export type ApplyResult =
  | { ok: true; state: BookingState }
  | { ok: false; status: number; error: string };

/** The money-critical booking-event core (shared by the web action and the API route).
    Loads the booking, enforces the party+EVENT_SIDES gate, drives transition(),
    refunds-first on cancel, and CAS-writes. NO redirect/revalidate. */
export async function applyBookingEvent(
  userId: string, bookingId: string, event: UserEvent,
): Promise<ApplyResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, status: 404, error: "Booking not found." };

  const role = await partyRoleFor(booking, userId);
  if (!role || !EVENT_SIDES[event]?.includes(role)) {
    return { ok: false, status: 403, error: "You can't take that action on this booking." };
  }

  const from = booking.state as BookingState;
  let next = transition(from, event);
  if (!next) return { ok: false, status: 409, error: "That action isn't available right now." };

  const data: Record<string, unknown> = { state: next };
  const stamp = TIMESTAMPS[event];
  if (stamp) data[stamp] = new Date();

  if (event === "TRIP_COMPLETE") {
    const completedAt = new Date();
    data.completedAt = completedAt;
    const windowState = transition(next, "PAYOUT_SCHEDULED");
    if (windowState) next = windowState;
    data.state = next;
  }

  if (isCancelState(next) || next === "PAID_OUT") data.closedAt = new Date();

  // Refund first, transition second (G-1 tiers are placeholder config).
  if (isCancelState(next) && booking.stripePaymentIntentId && !booking.stripeRefundId) {
    const refundCents = refundCentsFor(next, booking.rateCents + booking.feeCents);
    if (refundCents > 0) {
      data.stripeRefundId = await refundBookingPayment(
        booking.stripePaymentIntentId, refundCents, `cancel-refund-${booking.id}`,
      );
    }
  }

  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, state: from }, // CAS
    data,
  });
  if (updated.count === 0) {
    if (data.stripeRefundId) {
      console.error(`booking ${bookingId}: refund ${data.stripeRefundId} issued but ${event} lost the state race`);
      await prisma.booking.update({ where: { id: bookingId }, data: { stripeRefundId: data.stripeRefundId } });
    }
    return { ok: false, status: 409, error: "The booking changed — refresh." };
  }
  return { ok: true, state: next as BookingState };
}
```

- [ ] **Step 2: Rewrite `bookingEventAction`** in `actions.ts` as a thin wrapper — delete the moved `EVENT_SIDES`/`TIMESTAMPS`/core (lines 120–214) and replace `bookingEventAction` with:

```ts
import { applyBookingEvent, type UserEvent } from "../../lib/booking-events";
// ...
export async function bookingEventAction(bookingId: string, eventType: UserEvent) {
  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/${bookingId}`);
  await applyBookingEvent(user.id, bookingId, eventType); // errors are stale-tab no-ops on web
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
}
```
Keep `createBookingAction` and `beginBookingCheckout` unchanged. Update `[id]/page.tsx`'s `Event` component if it imports `EVENT_SIDES`'s key type — it uses `bookingEventAction.bind(null, bookingId, event)`; the `event` values are `UserEvent`s, so retype the `Event` prop to `UserEvent` (import from lib/booking-events). Verify `[id]/page.tsx` still compiles.

- [ ] **Step 3: Move + extend the tests.** The current `apps/web/app/bookings/actions.test.ts` tests `bookingEventAction`'s core (refund-first, CAS, etc.). Create `apps/web/lib/booking-events.test.ts` testing `applyBookingEvent` DIRECTLY (call it with `(userId, bookingId, event)`; mock prisma + `partyRoleFor` + `@crewmarket/payments`). Port every existing money-path assertion (weather-cancel 100% refund + stored id; failed refund throws; cancel from ACCEPTED no refund; already-refunded no double refund; CAS-lost salvage; non-party 403; invalid-event 409). Add: `availableEventsFor(state, role)` returns the right events (e.g. REQUESTED+CREW → [CREW_ACCEPT, CREW_DECLINE]; ESCROW_FUNDED+BOAT → [CANCEL_BOAT, CANCEL_WEATHER, TRIP_START]). Trim `actions.test.ts` to keep only what still tests the web wrapper (or delete cases now covered by booking-events.test.ts — don't lose coverage, just relocate).

- [ ] **Step 4: Verify** — `pnpm --filter web test && pnpm build && pnpm compliance:check` all green.

- [ ] **Step 5: Commit**
```bash
git add apps/web/lib/booking-events.ts apps/web/lib/booking-events.test.ts apps/web/app/bookings/actions.ts apps/web/app/bookings/actions.test.ts apps/web/app/bookings/[id]/page.tsx
git commit -m "[ai-assisted] bookings: extract applyBookingEvent core shared by web action + (coming) API route; EVENT_SIDES/availableEventsFor exported (P-2, G-1, M-2; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 2: Booking projections + list/detail GET routes (TDD)

**Files:** `apps/web/lib/booking-view.ts`, `apps/web/app/api/bookings/route.ts` (+test), `apps/web/app/api/bookings/[id]/route.ts` (+test).

- [ ] **Step 1: Projections `apps/web/lib/booking-view.ts`** — party-safe shapes (P-4). Use `crewProfileById` (seed displayName) and the boat `User.name`.

```ts
import "server-only";
import type { Booking } from "@crewmarket/db";
import { fmtUsd, type BookingState } from "@crewmarket/types";
import { crewProfileById, type PartyRole } from "./bookings";

export type BookingSummary = {
  id: string; state: BookingState; role: PartyRole;
  counterpartyName: string; dates: string[]; totalCents: number;
};
export type BookingDetail = BookingSummary & {
  rateCents: number; feeCents: number; tripType: string;
  requestedAt: string; completedAt: string | null;
  hasRefund: boolean; hasPayout: boolean; availableEvents: string[];
};

// counterparty: BOAT sees crew profile name; CREW sees boat user name (passed in).
export function toBookingSummary(b: Booking, role: PartyRole, boatName: string): BookingSummary {
  const counterpartyName =
    role === "BOAT" ? (crewProfileById(b.crewProfileId)?.displayName ?? "Crew") : boatName;
  return {
    id: b.id, state: b.state as BookingState, role, counterpartyName,
    dates: b.dates as string[], totalCents: b.rateCents + b.feeCents,
  };
}
export function toBookingDetail(
  b: Booking, role: PartyRole, boatName: string, availableEvents: string[],
): BookingDetail {
  return {
    ...toBookingSummary(b, role, boatName),
    rateCents: b.rateCents, feeCents: b.feeCents, tripType: b.tripType,
    requestedAt: b.requestedAt.toISOString(),
    completedAt: b.completedAt?.toISOString() ?? null,
    hasRefund: !!b.stripeRefundId, hasPayout: !!b.stripeTransferId,
    availableEvents,
  };
}
export { fmtUsd };
```
(Confirm `crewProfileById` is exported from `lib/bookings.ts` — it is, used by actions.ts. The boat user's name needs a lookup in the routes: `prisma.user.findUnique({where:{id: boatUserId}, select:{name:true}})`.)

- [ ] **Step 2: `GET /api/bookings`** (`apps/web/app/api/bookings/route.ts`) — TDD. Auth via `getSession`; role from `accountType`; `bookingsForUser(user.id, role)` (already runs `withElapsedWindow`); map to summaries (resolve boat name per row for crew callers — batch a `user.findMany` on the distinct boatUserIds). Return `{ bookings: BookingSummary[] }`. 401 signed out. Tests: 401; boat list shape; crew list shape; empty.

- [ ] **Step 3: `GET /api/bookings/[id]`** (`apps/web/app/api/bookings/[id]/route.ts`) — TDD. Load booking; `partyRoleFor` → **404** if not a party (never 403 — don't reveal existence); `withElapsedWindow`; compute `availableEventsFor(state, role)`; resolve boat name; return `{ booking: BookingDetail }`. Tests: 401; 404 non-party; 404 missing; boat detail (with availableEvents); crew detail.

- [ ] **Step 4: Verify** `pnpm --filter web test -- app/api/bookings && pnpm build && pnpm compliance:check`.

- [ ] **Step 5: Commit** `[ai-assisted] bookings: GET /api/bookings + /[id] — party-safe JSON, withElapsedWindow on read, availableEvents (P-2, P-4; no rules touched)` (+ trailers).

---

### Task 3: Event + checkout POST routes (TDD)

**Files:** `apps/web/app/api/bookings/[id]/event/route.ts` (+test), `apps/web/app/api/bookings/[id]/checkout/route.ts` (+test).

- [ ] **Step 1: `POST /api/bookings/[id]/event`** — TDD. Auth; body `{ event }`; validate `event` ∈ EVENT_SIDES keys (400 otherwise); `const r = await applyBookingEvent(user.id, id, event)`; return `r.ok ? Response.json({ ok, state }) : Response.json({ error: r.error }, { status: r.status })`. Tests (mock `applyBookingEvent` OR mock its deps): 401; unknown event → 400; success → `{ok,state}`; applyBookingEvent 403/409 mapped through.

- [ ] **Step 2: `POST /api/bookings/[id]/checkout`** — TDD. Auth; load booking; `partyRoleFor` must be BOAT (403); `booking.state === "ACCEPTED"` else 409; call `createBookingCheckout(...)` (same args as `beginBookingCheckout`, reuse `BETTER_AUTH_URL` base + `?paid=pending` return); return `{ url }` (NOT a redirect). Tests (mock `@crewmarket/payments` createBookingCheckout + prisma + session + partyRoleFor): 401; non-boat 403; non-ACCEPTED 409; success returns `{url}`.

- [ ] **Step 3: Verify** `pnpm --filter web test && pnpm build && pnpm compliance:check`.

- [ ] **Step 4: Commit** `[ai-assisted] bookings: POST /event (applyBookingEvent) + /checkout (returns Stripe url as JSON) (P-2, P-3, M-2; no rules touched)` (+ trailers).

---

### Task 4: Mobile `eventLabel` pure helper (TDD)

**Files:** `apps/mobile/lib/booking-labels.ts` (+test).

- [ ] **Step 1: Tests** — `eventLabel(event, { rateCents })` → copy: CREW_ACCEPT→"Accept booking", CREW_DECLINE→"Decline", CANCEL_BOAT→"Cancel booking", CANCEL_CREW→"Cancel booking", CANCEL_WEATHER→"Cancel — weather", TRIP_START→"Start trip", TRIP_COMPLETE→"Trip complete". Plus a `STATE_LABELS` map matching the web (`ESCROW_FUNDED`→"Funds held", never "escrow" — G-1) and a `HOLD_FUNDS_LABEL(totalCents)`→`Hold funds — $X`. All pure.

- [ ] **Step 2: Implement** `apps/mobile/lib/booking-labels.ts` — pure functions/maps, import `fmtUsd` from `@crewmarket/types`. No RN imports.

- [ ] **Step 3: Verify** `pnpm --filter mobile test -- booking-labels && pnpm --filter mobile exec tsc --noEmit && pnpm compliance:check`.

- [ ] **Step 4: Commit** `[ai-assisted] mobile: pure booking event/state label helper, tested (G-1; no rules touched)` (+ trailers).

---

### Task 5: Mobile tab-bar restructure

**Files:** create `apps/mobile/src/app/(tabs)/_layout.tsx`; move `index.tsx` + `account.tsx` into `(tabs)/`; modify `apps/mobile/src/app/_layout.tsx`.

- [ ] **Step 1: Read** the current `_layout.tsx`, `index.tsx`, `account.tsx`, and `lib/tokens.ts` (navy/brass). Move `src/app/index.tsx` → `src/app/(tabs)/index.tsx` and `src/app/account.tsx` → `src/app/(tabs)/account.tsx` (fix relative import depth: `../../lib` → `../../../lib`). Create `src/app/(tabs)/_layout.tsx` = a `Tabs` navigator (expo-router) with Board / Bookings / Account, navy tab bar + brass active tint, using the existing engraving/text style (icons optional — a text or simple SVG). Root `src/app/_layout.tsx` keeps the `Stack`, with `(tabs)` as one screen (headerShown false for the group) plus the existing `crew/[id]`, `sign-in`, `sign-up` stack screens; move the header account/sign-in entry OUT (the Account tab replaces it).

- [ ] **Step 2: Signed-out handling** — the Bookings and Account tabs should redirect to `/sign-in` when there's no session (reuse the `useSession` guard already in `account.tsx`). The Board tab stays public.

- [ ] **Step 3: Verify** `pnpm --filter mobile exec tsc --noEmit` (regenerate typedRoutes first: run `expo start` ~8s then stop, since new routes were added), `pnpm --filter mobile lint`, `pnpm --filter mobile test` (19 still green). Note: expo export optional.

- [ ] **Step 4: Commit** `[ai-assisted] mobile: Board/Bookings/Account tab bar (expo-router tabs) (no rules touched)` (+ trailers).

---

### Task 6: Bookings list screen

**Files:** `apps/mobile/src/app/(tabs)/bookings.tsx`.

- [ ] **Step 1: Build** — session-gated (redirect to sign-in if none). Fetch `authClient.$fetch<{bookings: BookingSummary[]}>(`${API_URL}/api/bookings`)` (ABSOLUTE url). FlatList of rows: state badge (from `STATE_LABELS`), counterparty name, dates, `fmtUsd(totalCents)`; tap → `router.push(`/bookings/${id}`)`. Role-aware empty states (no bookings; "your account isn't linked to a board profile yet" if a crew list comes back empty — the API can't tell claim state, so a generic empty is fine, or fetch `/api/me` to distinguish). Pull-to-refresh. Match tokens/board-row idiom.

- [ ] **Step 2: Verify** `tsc --noEmit`, `lint`, `compliance:check`, `pnpm --filter mobile test`.

- [ ] **Step 3: Commit** `[ai-assisted] mobile: bookings list screen (GET /api/bookings) (P-4, G-1; no rules touched)` (+ trailers).

---

### Task 7: Booking detail + actions + payment

**Files:** `apps/mobile/src/app/bookings/[id].tsx`.

- [ ] **Step 1: Build the ledger** — fetch `${API_URL}/api/bookings/${id}` → `BookingDetail`. Render: state (via `STATE_LABELS`), a simple trail, money block (rate + itemized fee + total via `fmtUsd`), parties (counterparty name + your role). Then action buttons from `booking.availableEvents`: for each event render a brass button labeled by `eventLabel(event, booking)`; on press → `authClient.$fetch(`${API_URL}/api/bookings/${id}/event`, { method:"POST", body:{ event } })`; on `{ok}` re-fetch the detail; on `{error}` show it inline (`serverError` helper). Disable buttons while a request is in flight.

- [ ] **Step 2: Payment (boat, ACCEPTED)** — when `availableEvents` implies pay (state ACCEPTED + role BOAT), render a **"Hold funds — $X"** brass button (label via `HOLD_FUNDS_LABEL(totalCents)`). On press → POST `${API_URL}/api/bookings/${id}/checkout` → get `{url}` → `WebBrowser.openBrowserAsync(url)`. On resolve (browser dismissed), set a "Confirming payment…" state and poll `GET /api/bookings/${id}` every 2s up to ~5 times until `state === "ESCROW_FUNDED"` (then show funds-held) or stop (leave a manual "Refresh" affordance). Never assume success on return — webhook is source of truth. Copy avoids "escrow" (G-1).

- [ ] **Step 3: Verify** `tsc --noEmit`, `lint`, `compliance:check`, `pnpm --filter mobile test`, and `expo export --platform ios` if feasible.

- [ ] **Step 4: Commit** `[ai-assisted] mobile: booking detail ledger — actions via /event, boat pay via Checkout-in-browser + poll (P-2, G-1, M-2; no rules touched)` (+ trailers).

---

### Task 8: Full verification + deploy

- [ ] **Step 1:** `pnpm lint && pnpm test && pnpm build && pnpm compliance:check` — fix red, re-run.
- [ ] **Step 2:** `git push origin main` (auto-deploys the new API routes to Vercel). Wait for Ready; smoke-check `GET /api/bookings` → 401 signed out on `https://crewmarket-web.vercel.app`.
- [ ] **Step 3:** Update HANDOFF with the slice-3 state + the new routes.

---

### Task 9: Device pass (user, Expo Go)

- [ ] **Step 1:** `EXPO_PUBLIC_API_URL=https://crewmarket-web.vercel.app npx expo start` in apps/mobile; open in Expo Go.
- [ ] **Step 2:** Verify: tab bar (Board/Bookings/Account); as crew, open a REQUESTED booking → Accept → Start → Complete; as boat, open an ACCEPTED booking → Hold funds → pay `4242` in the browser → return → funds-held confirms; cancel a booking (refund path); non-party bookings not visible. (Use the seeded `boat@example.com` / `mate@example.com` demo accounts; create a fresh booking from the web if needed.)
- [ ] **Step 3:** Record device-only bugs; fix; finalize HANDOFF.

---

## Self-review notes (spec → task map)

- Spec §1 extract → Task 1 (verbatim move + retargeted tests + `availableEventsFor`).
- Spec §2 routes → Tasks 2 (GET list/detail) + 3 (event/checkout); all run `withElapsedWindow`, party-safe, 404 non-party.
- Spec §3 mobile → Task 4 (labels), 5 (tabs), 6 (list), 7 (detail + pay).
- Spec §4 compliance → gates every task; G-1 "funds held" in labels; M-2 gate in applyBookingEvent; P-4 projection.
- Spec §5 testing → server unit Tasks 1–3, mobile pure Task 4, device pass Task 9.
- Absolute-URL rule applied in Tasks 6 & 7. Creation stays web (not built).
