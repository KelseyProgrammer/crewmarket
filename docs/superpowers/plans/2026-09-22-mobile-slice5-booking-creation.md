# Mobile Slice 5 — Boat-Side Booking Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native boat-side booking creation on mobile — a request form screen that fully replaces the web hand-off — backed by a shared server creation core and a new `POST /api/bookings` route.

**Architecture:** Extract the creation logic out of the web server action into `apps/web/lib/booking-create.ts` (one home for the BOAT-only / trip-type-offered / R4 recompute / D-4 attestation guards, slice-4 `credential-service.ts` pattern); the web action and a new `POST /api/bookings` JSON route become thin wrappers. The mobile screen reads crew data from the existing board cache and imports the money math directly from `@crewmarket/types` (preview-only — the server recomputes).

**Tech Stack:** Next.js 15 App Router + Prisma (web), Expo / expo-router + better-auth Expo client (mobile), vitest both sides. One new mobile dependency: `@react-native-community/datetimepicker`.

**Spec:** `docs/superpowers/specs/2026-09-22-mobile-slice5-booking-creation-design.md`

**House rules that bite here (from HANDOFF.md, cost real time before):**
- `apps/web/tsconfig.json` has `strict: false` — TypeScript will NOT narrow a boolean-discriminated union. Narrow the core's result via `"error" in result`, never `!result.ok`. Always run `pnpm build`, not just tests.
- Mobile typedRoutes: after adding a route file, `.expo/types/router.d.ts` regenerates only on `expo start` (not `expo export`) — run the dev server once before `tsc` on a fresh checkout.
- One agent per working tree, sequential — never parallel subagents in this repo.
- Commits: `[ai-assisted]` prefix + compliance rule IDs.
- Copy law: user-facing text says "funds held", NEVER "escrow" (the only allowed "escrow" strings are the internal `ESCROW_FUNDED` enum + derived CSS class).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/lib/booking-create.ts` | Create | Shared creation core: guards + quote recompute + `prisma.booking.create` |
| `apps/web/lib/booking-create.test.ts` | Create | TDD guard matrix for the core |
| `apps/web/app/bookings/actions.ts` | Modify | `createBookingAction` becomes a thin FormData wrapper |
| `apps/web/app/api/bookings/route.ts` | Modify | Add `POST` (GET untouched) |
| `apps/web/app/api/bookings/route.test.ts` | Modify | Add POST tests |
| `apps/web/app/crew/[id]/page.tsx` | Modify | Trim stale "(Demo build: …simulated)" copy (line ~162) |
| `apps/mobile/lib/server-error.ts` | Create | Shared `serverError()` (3rd duplicate justifies extraction) |
| `apps/mobile/lib/request-form.ts` | Create | Pure form logic: clamp/effective days, quote, canSubmit, payload, localIsoDate |
| `apps/mobile/lib/request-form.test.ts` | Create | Unit tests for the above |
| `apps/mobile/src/app/bookings/new.tsx` | Create | The native request form screen (`/bookings/new?crew=<id>`) |
| `apps/mobile/src/app/crew/[id].tsx` | Modify | BOOKING panel: native entry button replaces the web deep-link |
| `apps/mobile/package.json` | Modify | `@react-native-community/datetimepicker` via `npx expo install` |
| `HANDOFF.md` | Modify | Slice-5 record (final task) |

---

### Task 1: Server creation core — `booking-create.ts` (TDD)

**Files:**
- Create: `apps/web/lib/booking-create.ts`
- Test: `apps/web/lib/booking-create.test.ts`

The core owns the guard chain currently inlined in `createBookingAction`
(`apps/web/app/bookings/actions.ts:26-74`) — identical guard ORDER and identical
error copy, so the web form's UX is unchanged when Task 2 rewires it.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/booking-create.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* createBookingRequest — the one home for the booking-creation guards (slice-5).
   Guard order and error copy are frozen: the web action and POST /api/bookings
   both surface these strings verbatim. R4: quote recomputed from crew-listed
   rates — client money math never trusted. D-4: no booking without the P&I
   attestation. M-2: only crew-listed trip types are bookable. */

const seams = vi.hoisted(() => ({
  crewProfileById: vi.fn(),
  prisma: { booking: { create: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("./bookings", () => ({ crewProfileById: seams.crewProfileById }));

import { createBookingRequest } from "./booking-create";

const boat = { id: "boat1", accountType: "BOAT" };
// dayRateUsd only: offers FULL_DAY + MULTI_DAY, NOT HALF_DAY / TOURNAMENT (M-2).
const crew = { id: "p1", displayName: "Del Pinder", dayRateUsd: 100 };

function input(over: Record<string, unknown> = {}) {
  return {
    crewProfileId: "p1",
    tripType: "FULL_DAY",
    startDate: "2026-10-01",
    days: 1,
    piAttested: true,
    ...over,
  } as Parameters<typeof createBookingRequest>[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.crewProfileById.mockReturnValue(crew);
  seams.prisma.booking.create.mockImplementation(async ({ data }: { data: object }) => ({
    id: "b1",
    ...data,
  }));
});

describe("createBookingRequest — guards", () => {
  it("403 for a CREW account", async () => {
    const r = await createBookingRequest({ id: "crew1", accountType: "CREW" }, input());
    expect(r).toEqual({ error: "Only boat accounts send booking requests.", status: 403 });
  });

  it("403 when accountType is missing entirely", async () => {
    const r = await createBookingRequest({ id: "u1" }, input());
    expect(r).toEqual({ error: "Only boat accounts send booking requests.", status: 403 });
  });

  it("400 unknown crew profile", async () => {
    seams.crewProfileById.mockReturnValue(null);
    const r = await createBookingRequest(boat, input());
    expect(r).toEqual({ error: "Unknown crew profile.", status: 400 });
  });

  it("400 trip type the crew does not list a rate for (M-2)", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "HALF_DAY" }));
    expect(r).toEqual({
      error: "Choose a trip type this crew member lists a rate for.",
      status: 400,
    });
  });

  it("400 garbage trip type string", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "YACHT_WEEK" }));
    expect(r).toEqual({
      error: "Choose a trip type this crew member lists a rate for.",
      status: 400,
    });
  });

  it("400 malformed start date", async () => {
    const r = await createBookingRequest(boat, input({ startDate: "10/01/2026" }));
    expect(r).toEqual({ error: "Pick a start date.", status: 400 });
  });

  it("400 days out of range for MULTI_DAY (max 10)", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "MULTI_DAY", days: 11 }));
    expect(r).toEqual({ error: "Days must be between 1 and 10.", status: 400 });
  });

  it("400 non-integer days", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "MULTI_DAY", days: 2.5 }));
    expect(r).toEqual({ error: "Days must be between 1 and 10.", status: 400 });
  });

  it("400 without the P&I attestation (D-4)", async () => {
    const r = await createBookingRequest(boat, input({ piAttested: false }));
    expect(r).toEqual({
      error: "Confirm the vessel carries P&I coverage for this trip.",
      status: 400,
    });
    expect(seams.prisma.booking.create).not.toHaveBeenCalled();
  });
});

describe("createBookingRequest — creation (R4: server recompute)", () => {
  it("single-day trip: smuggled days are coerced to 1, money recomputed", async () => {
    const r = await createBookingRequest(boat, input({ days: 5 }));
    expect("error" in r).toBe(false);
    expect(seams.prisma.booking.create).toHaveBeenCalledWith({
      data: {
        crewProfileId: "p1",
        boatUserId: "boat1",
        tripType: "FULL_DAY",
        dates: ["2026-10-01"],
        rateCents: 10000,
        feeCents: 1200,
        piAttestedAt: expect.any(Date),
      },
    });
  });

  it("multi-day happy path: consecutive dates, rate × days, itemized fee (P-3)", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "MULTI_DAY", days: 3 }));
    if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
    expect(r.booking.id).toBe("b1");
    expect(seams.prisma.booking.create).toHaveBeenCalledWith({
      data: {
        crewProfileId: "p1",
        boatUserId: "boat1",
        tripType: "MULTI_DAY",
        dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
        rateCents: 30000,
        feeCents: 3600,
        piAttestedAt: expect.any(Date),
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web exec vitest run lib/booking-create.test.ts`
Expected: FAIL — `Cannot find module './booking-create'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

`apps/web/lib/booking-create.ts`:

```ts
import "server-only";
import { prisma, type Booking } from "@crewmarket/db";
import {
  computeQuote,
  datesFrom,
  maxDaysFor,
  tripTypesFor,
  TRIP_TYPES,
  type TripType,
} from "@crewmarket/types";
import { crewProfileById } from "./bookings";

/* Booking creation core (slice 5) — the ONE home for the creation guards,
   shared by the web server action and POST /api/bookings (pattern:
   credential-service.ts). Guard order and error copy are frozen — both
   wrappers surface these strings verbatim.
   R4: the quote is recomputed here from crew-listed rates — client money
   math is never trusted. D-4: the booking row cannot exist without the
   P&I attestation. M-2: only crew-listed trip types are bookable. */

export type CreateBookingInput = {
  crewProfileId: string;
  tripType: string;
  startDate: string; // ISO YYYY-MM-DD
  days: number;
  piAttested: boolean;
};

export type CreateBookingResult =
  | { booking: Booking }
  | { error: string; status: 400 | 403 };

export async function createBookingRequest(
  user: { id: string; accountType?: string },
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  if (user.accountType !== "BOAT") {
    return { error: "Only boat accounts send booking requests.", status: 403 };
  }

  const crew = crewProfileById(input.crewProfileId);
  if (!crew) return { error: "Unknown crew profile.", status: 400 };

  const tripType = input.tripType as TripType;
  if (!TRIP_TYPES.includes(tripType) || !tripTypesFor(crew).includes(tripType)) {
    return { error: "Choose a trip type this crew member lists a rate for.", status: 400 };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    return { error: "Pick a start date.", status: 400 };
  }

  const days = maxDaysFor(tripType) === 1 ? 1 : input.days;
  const quote = computeQuote(crew, tripType, days);
  if (!quote) return { error: `Days must be between 1 and ${maxDaysFor(tripType)}.`, status: 400 };

  if (!input.piAttested) {
    return { error: "Confirm the vessel carries P&I coverage for this trip.", status: 400 };
  }

  const booking = await prisma.booking.create({
    data: {
      crewProfileId: input.crewProfileId,
      boatUserId: user.id,
      tripType,
      dates: datesFrom(input.startDate, days),
      rateCents: quote.rateCents,
      feeCents: quote.feeCents,
      piAttestedAt: new Date(),
    },
  });
  return { booking };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web exec vitest run lib/booking-create.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/booking-create.ts apps/web/lib/booking-create.test.ts
git commit -m "[ai-assisted] feat: booking-creation core extracted to lib/booking-create — one home for the creation guards (M-2, D-4, P-3, R4) (no rules touched)"
```

---

### Task 2: Web action becomes a thin wrapper

**Files:**
- Modify: `apps/web/app/bookings/actions.ts:26-74` (`createBookingAction` body + imports)

- [ ] **Step 1: Rewire the action**

Replace the whole `createBookingAction` function (lines 26–74) with:

```ts
export async function createBookingAction(
  _prev: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/bookings/new");

  // All guards + quote recompute live in the shared core (lib/booking-create.ts).
  const result = await createBookingRequest(user, {
    crewProfileId: String(formData.get("crewProfileId") ?? ""),
    tripType: String(formData.get("tripType") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    days: Number(formData.get("days") ?? 1),
    piAttested: formData.get("piAttested") === "on",
  });

  // strict:false — narrow via "error" in result, never a boolean flag.
  if ("error" in result) return { error: result.error };

  revalidatePath("/bookings");
  redirect(`/bookings/${result.booking.id}`);
}
```

Update the imports at the top of the file: add
`import { createBookingRequest } from "../../lib/booking-create";` and remove the
now-unused `prisma`, `computeQuote`, `datesFrom`, `maxDaysFor`, `tripTypesFor`,
`TRIP_TYPES`, and `crewProfileById` imports. **Keep** `TRIP_TYPE_LABELS`, `TripType`,
and the `prisma` import IF still used by `beginBookingCheckout` below (it is — keep
`prisma`; delete only what `pnpm lint` flags as unused).

- [ ] **Step 2: Run web tests + lint**

Run: `pnpm --filter web test` and `pnpm lint`
Expected: all existing web tests PASS; lint clean (no unused imports).

- [ ] **Step 3: Build (strict:false narrowing check)**

Run: `pnpm build`
Expected: green. If `next build` complains inside `createBookingAction`, the union
narrowing regressed — must be `"error" in result`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/bookings/actions.ts
git commit -m "[ai-assisted] refactor: createBookingAction is a thin wrapper over the shared creation core (behavior unchanged) (no rules touched)"
```

---

### Task 3: `POST /api/bookings` (TDD)

**Files:**
- Modify: `apps/web/app/api/bookings/route.ts` (add POST; GET untouched)
- Test: `apps/web/app/api/bookings/route.test.ts` (add POST describe block)

- [ ] **Step 1: Write the failing tests**

In `route.test.ts`: add `createBookingRequest: vi.fn()` to the hoisted `seams`
object, add the mock line below the existing `vi.mock` calls, and change the
import to `import { GET, POST } from "./route";`

```ts
vi.mock("../../../lib/booking-create", () => ({
  createBookingRequest: seams.createBookingRequest,
}));
```

Append the new describe block at the bottom of the file:

```ts
function postReq(body: unknown) {
  return new Request("http://test/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bookings", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await POST(postReq({}))).status).toBe(401);
    expect(seams.createBookingRequest).not.toHaveBeenCalled();
  });

  it("400 on a malformed JSON body without touching the core", async () => {
    const res = await POST(
      new Request("http://test/api/bookings", { method: "POST", body: "not json" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Malformed request." });
    expect(seams.createBookingRequest).not.toHaveBeenCalled();
  });

  it("maps a core error to its status with { error } JSON", async () => {
    seams.createBookingRequest.mockResolvedValue({
      error: "Only boat accounts send booking requests.",
      status: 403,
    });
    const res = await POST(postReq({ crewProfileId: "p1" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only boat accounts send booking requests." });
  });

  it("201 + { id } on success; input is shape-coerced (smuggled money fields dropped)", async () => {
    seams.createBookingRequest.mockResolvedValue({ booking: { id: "b9" } });
    const res = await POST(
      postReq({
        crewProfileId: "p1",
        tripType: "FULL_DAY",
        startDate: "2026-10-01",
        days: 1,
        piAttested: true,
        rateCents: 1, // must never reach the core (R4/P-4)
      })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "b9" });
    expect(seams.createBookingRequest).toHaveBeenCalledWith(
      { id: "boat1", accountType: "BOAT" },
      { crewProfileId: "p1", tripType: "FULL_DAY", startDate: "2026-10-01", days: 1, piAttested: true }
    );
  });

  it("days defaults to 1 and piAttested to false when absent/mistyped", async () => {
    seams.createBookingRequest.mockResolvedValue({ error: "x", status: 400 });
    await POST(postReq({ crewProfileId: "p1", tripType: "FULL_DAY", startDate: "2026-10-01", days: "3", piAttested: "yes" }));
    expect(seams.createBookingRequest).toHaveBeenCalledWith(expect.anything(), {
      crewProfileId: "p1",
      tripType: "FULL_DAY",
      startDate: "2026-10-01",
      days: 1,
      piAttested: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter web exec vitest run app/api/bookings/route.test.ts`
Expected: existing GET tests PASS; new POST tests FAIL (`POST` is not exported).

- [ ] **Step 3: Implement POST**

In `route.ts`, add the import and handler (GET stays exactly as-is):

```ts
import { createBookingRequest } from "../../../lib/booking-create";
```

```ts
/* POST /api/bookings — boat-side booking creation from mobile (slice 5).
   Thin wrapper over lib/booking-create.ts: session gate, shape-coerce the
   body (client money fields can never reach the core — R4/P-4), map core
   errors to their status. Success returns only the id; the client fetches
   the party-safe projection from GET /api/bookings/[id]. */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string; accountType?: string };

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const result = await createBookingRequest(
    { id: user.id, accountType: user.accountType },
    {
      crewProfileId: typeof b.crewProfileId === "string" ? b.crewProfileId : "",
      tripType: typeof b.tripType === "string" ? b.tripType : "",
      startDate: typeof b.startDate === "string" ? b.startDate : "",
      days: typeof b.days === "number" ? b.days : 1,
      piAttested: b.piAttested === true,
    }
  );

  // strict:false — narrow via "error" in result, never a boolean flag.
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.booking.id }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web exec vitest run app/api/bookings/route.test.ts`
Expected: PASS (all GET + POST tests).

- [ ] **Step 5: Build + commit**

Run: `pnpm build` — expected green.

```bash
git add apps/web/app/api/bookings/route.ts apps/web/app/api/bookings/route.test.ts
git commit -m "[ai-assisted] feat: POST /api/bookings — auth-gated booking creation route for mobile, wraps the shared core (M-2, D-4, P-4, R4) (no rules touched)"
```

---

### Task 4: Mobile pure logic — `request-form.ts` + shared `serverError` (TDD)

**Files:**
- Create: `apps/mobile/lib/server-error.ts`
- Create: `apps/mobile/lib/request-form.ts`
- Test: `apps/mobile/lib/request-form.test.ts`
- Modify: every mobile screen with a local `serverError` copy (grep in Step 4)

- [ ] **Step 1: Write the failing tests**

`apps/mobile/lib/request-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canSubmit,
  clampDays,
  draftPayload,
  draftQuote,
  effectiveDays,
  localIsoDate,
  type RequestDraft,
} from "./request-form";

/* Pure request-form logic (slice 5). Money math itself comes straight from
   @crewmarket/types (the same computeQuote the web form and the server use) —
   these tests pin the FORM's behavior around it: day coercion, submit gating,
   and the exact payload shape POST /api/bookings expects. Preview-only (R4). */

const rates = { dayRateUsd: 100 }; // offers FULL_DAY + MULTI_DAY only (M-2)

function draft(over: Partial<RequestDraft> = {}): RequestDraft {
  return { tripType: "FULL_DAY", days: 1, startDate: "2026-10-01", piAttested: true, ...over };
}

describe("clampDays", () => {
  it("clamps into 1..maxDaysFor and rounds", () => {
    expect(clampDays("MULTI_DAY", 0)).toBe(1);
    expect(clampDays("MULTI_DAY", 11)).toBe(10);
    expect(clampDays("MULTI_DAY", 2.6)).toBe(3);
    expect(clampDays("FULL_DAY", 7)).toBe(1);
  });
});

describe("effectiveDays", () => {
  it("forces 1 for single-day trip types, passes days through otherwise", () => {
    expect(effectiveDays("FULL_DAY", 5)).toBe(1);
    expect(effectiveDays("HALF_DAY", 5)).toBe(1);
    expect(effectiveDays("MULTI_DAY", 5)).toBe(5);
  });
});

describe("draftQuote", () => {
  it("quotes with effective days (single-day stays a 1-day quote)", () => {
    expect(draftQuote(rates, draft({ days: 5 }))).toEqual({
      rateCents: 10000,
      feeCents: 1200,
      totalCents: 11200,
    });
  });

  it("null for a trip type the crew does not list (M-2)", () => {
    expect(draftQuote(rates, draft({ tripType: "HALF_DAY" }))).toBeNull();
  });

  it("null for out-of-range multi-day", () => {
    expect(draftQuote(rates, draft({ tripType: "MULTI_DAY", days: 11 }))).toBeNull();
  });
});

describe("canSubmit", () => {
  it("true only with a quote, a picked date, and the P&I attestation (D-4)", () => {
    expect(canSubmit(rates, draft())).toBe(true);
    expect(canSubmit(rates, draft({ piAttested: false }))).toBe(false);
    expect(canSubmit(rates, draft({ startDate: "" }))).toBe(false);
    expect(canSubmit(rates, draft({ startDate: "10/01/2026" }))).toBe(false);
    expect(canSubmit(rates, draft({ tripType: "HALF_DAY" }))).toBe(false);
  });
});

describe("draftPayload", () => {
  it("matches POST /api/bookings shape, with effective days applied", () => {
    expect(draftPayload("p1", draft({ days: 5 }))).toEqual({
      crewProfileId: "p1",
      tripType: "FULL_DAY",
      startDate: "2026-10-01",
      days: 1,
      piAttested: true,
    });
  });
});

describe("localIsoDate", () => {
  it("formats in LOCAL time — toISOString would shift the day west of UTC", () => {
    // Date(2026, 9, 1) is local midnight Oct 1 — must stay Oct 1 in any zone.
    expect(localIsoDate(new Date(2026, 9, 1))).toBe("2026-10-01");
    expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mobile exec vitest run lib/request-form.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the two lib files**

`apps/mobile/lib/server-error.ts`:

```ts
/* Pull the human message off an authClient.$fetch error. Our JSON routes answer
   4xx with a body `{ error }`; better-fetch spreads that body onto the error
   object (alongside status/statusText), so the server's copy lands on
   `error.error`. `message` is the transport fallback. Third duplicate of this
   helper — extracted here per the tokens.ts rule of three. */
export function serverError(error: unknown): string | null {
  if (error && typeof error === "object") {
    const e = error as { error?: unknown; message?: unknown };
    if (typeof e.error === "string" && e.error) return e.error;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return null;
}
```

`apps/mobile/lib/request-form.ts`:

```ts
import {
  computeQuote,
  maxDaysFor,
  type BookingQuote,
  type CrewRates,
  type TripType,
} from "@crewmarket/types";

/* Pure logic for the native booking-request form (slice 5). The money math is
   the SAME computeQuote the web form and the server use — imported, not
   mirrored. Everything here is preview/validation only: the server recomputes
   the quote at create (R4) and enforces every guard again. */

export type RequestDraft = {
  tripType: TripType;
  days: number;
  startDate: string; // ISO YYYY-MM-DD, "" until picked
  piAttested: boolean;
};

/** Stepper guard: integer days inside 1..maxDaysFor(tripType). */
export function clampDays(tripType: TripType, days: number): number {
  return Math.min(Math.max(1, Math.round(days)), maxDaysFor(tripType));
}

/** Single-date trip types always book exactly one day, whatever the stepper held. */
export function effectiveDays(tripType: TripType, days: number): number {
  return maxDaysFor(tripType) === 1 ? 1 : days;
}

export function draftQuote(rates: CrewRates, d: RequestDraft): BookingQuote | null {
  return computeQuote(rates, d.tripType, effectiveDays(d.tripType, d.days));
}

/** Submit gate: a valid quote, a picked date, and the P&I attestation (D-4). */
export function canSubmit(rates: CrewRates, d: RequestDraft): boolean {
  return Boolean(
    draftQuote(rates, d) && /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) && d.piAttested
  );
}

/** Exactly the POST /api/bookings body — the server shape-coerces and re-guards. */
export function draftPayload(crewProfileId: string, d: RequestDraft) {
  return {
    crewProfileId,
    tripType: d.tripType,
    startDate: d.startDate,
    days: effectiveDays(d.tripType, d.days),
    piAttested: d.piAttested,
  };
}

/** Local-timezone YYYY-MM-DD — Date#toISOString is UTC and shifts the day west of UTC. */
export function localIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
```

- [ ] **Step 4: Deduplicate the existing serverError copies**

Run: `grep -rn "function serverError" apps/mobile/src`
For EACH hit (expected: `src/app/crew/[id].tsx`, `src/app/bookings/[id].tsx`, and
possibly `src/app/credentials.tsx`): delete the local `function serverError(...)`
block and add `import { serverError } from "../../../lib/server-error";` (adjust
`../` depth to the file's location — same depth as its existing `lib/` imports).

- [ ] **Step 5: Run tests to verify everything passes**

Run: `pnpm --filter mobile test`
Expected: PASS — the new request-form tests plus all existing mobile tests.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/server-error.ts apps/mobile/lib/request-form.ts apps/mobile/lib/request-form.test.ts apps/mobile/src
git commit -m "[ai-assisted] feat(mobile): pure request-form logic (shared computeQuote, submit gate, payload) + shared serverError helper (M-2, D-4, R4) (no rules touched)"
```

---

### Task 5: The native request screen — `/bookings/new`

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install`)
- Create: `apps/mobile/src/app/bookings/new.tsx`

- [ ] **Step 1: Install the date picker (SDK-pinned)**

Run: `cd apps/mobile && npx expo install @react-native-community/datetimepicker`
Expected: dependency added at the Expo-SDK-57-compatible version. Then `cd ../..`.

- [ ] **Step 2: Write the screen**

`apps/mobile/src/app/bookings/new.tsx` (static segment — expo-router prefers it
over the sibling `[id]` dynamic route, no collision):

```tsx
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  fmtUsd,
  maxDaysFor,
  tripTypesFor,
  PLATFORM_FEE_RATE,
  PLATFORM_FEE_SIDE,
  TRIP_TYPE_LABELS,
  type TripType,
} from "@crewmarket/types";
import { DisclaimerD2 } from "../../../components/disclaimer-d2";
import { API_URL } from "../../../lib/api";
import { authClient, useSession } from "../../../lib/auth-client";
import { authGuardState } from "../../../lib/auth-guard";
import { cachedBoard, getBoard, type BoardProfile } from "../../../lib/board";
import {
  canSubmit,
  clampDays,
  draftPayload,
  draftQuote,
  localIsoDate,
  type RequestDraft,
} from "../../../lib/request-form";
import { serverError } from "../../../lib/server-error";
import { color, font, radius, space } from "../../../lib/tokens";

/* Booking request form — native (slice 5). Section-for-section port of the web
   form (apps/web/app/bookings/new/request-form.tsx); every user-facing string
   is verbatim web copy. The quote here is PREVIEW ONLY (R4): the server
   recomputes from crew-listed rates at create. "Funds held", never "escrow"
   (G-1); trip types render only from crew-listed rates (M-2); the request
   cannot be sent without the P&I attestation (D-4). */

const FEE_PCT = `${Math.round(PLATFORM_FEE_RATE * 100)}%`;

type LoadState = "loading" | "not-found" | "error" | "ready";

export default function BookingRequestScreen() {
  const { crew: crewId } = useLocalSearchParams<{ crew: string }>();
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });

  const [profile, setProfile] = useState<BoardProfile | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // SIGNED_OUT is the only redirect (auth-guard discipline): on UNKNOWN the
  // form renders and the API's 401/403 is the authority, surfaced inline.
  useEffect(() => {
    if (gate === "SIGNED_OUT") router.replace("/sign-in");
  }, [gate, router]);

  useEffect(() => {
    let cancelled = false;

    function resolveFrom(all: BoardProfile[]) {
      if (cancelled) return;
      const found = all.find((p) => p.id === crewId) ?? null;
      setProfile(found);
      if (found) {
        const offered = tripTypesFor(found);
        setDraft({ tripType: offered[0], days: 1, startDate: "", piAttested: false });
      }
      setLoad(found ? "ready" : "not-found");
    }

    const cached = cachedBoard();
    if (cached) {
      resolveFrom(cached);
      return;
    }
    // Cold start / deep link: same convergence as the profile screen — board
    // and form read the one fetch, so they can never disagree.
    getBoard()
      .then(resolveFrom)
      .catch(() => {
        if (!cancelled) setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  async function onSubmit() {
    if (!profile || !draft || busy || !canSubmit(profile, draft)) return; // guard double-tap
    setBusy(true);
    setSubmitError(null);
    try {
      const { data, error } = await authClient.$fetch<{ id: string }>(`${API_URL}/api/bookings`, {
        method: "POST",
        body: draftPayload(profile.id, draft),
      });
      if (error || !data) {
        setSubmitError(serverError(error) ?? "Couldn't send the request — try again.");
        return;
      }
      // replace, not push: back from the ledger returns to the profile, not a stale form.
      router.replace(`/bookings/${data.id}`);
    } catch {
      setSubmitError("Couldn't send the request — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (gate === "CHECKING" || gate === "SIGNED_OUT" || load === "loading") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Booking request" }} />
        <ActivityIndicator color={color.navyDeep} />
      </View>
    );
  }

  if (load === "error") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Booking request" }} />
        <Text style={styles.centerText}>Can&apos;t reach the crew board — check your connection.</Text>
        <Pressable
          style={styles.retry}
          accessibilityRole="button"
          onPress={() => {
            setLoad("loading");
            getBoard()
              .then((all) => {
                const found = all.find((p) => p.id === crewId) ?? null;
                setProfile(found);
                if (found) {
                  const offered = tripTypesFor(found);
                  setDraft({ tripType: offered[0], days: 1, startDate: "", piAttested: false });
                }
                setLoad(found ? "ready" : "not-found");
              })
              .catch(() => setLoad("error"));
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (load === "not-found" || !profile || !draft) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Booking request" }} />
        <Text style={styles.centerText}>This crew profile isn&apos;t on the board.</Text>
      </View>
    );
  }

  const offered = tripTypesFor(profile);
  const firstName = profile.displayName.split(" ")[0];
  const multi = maxDaysFor(draft.tripType) > 1;
  const quote = draftQuote(profile, draft);
  const ready = canSubmit(profile, draft);
  const boatName = session?.user?.name ?? "your boat account";
  const pickerValue = draft.startDate ? new Date(draft.startDate + "T00:00:00") : new Date();

  const onPickDate = (_event: unknown, picked?: Date) => {
    setShowAndroidPicker(false);
    if (picked) setDraft({ ...draft, startDate: localIsoDate(picked) });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Booking request" }} />
      <Text style={styles.title}>Request {profile.displayName}</Text>

      {/* Trip type — only crew-listed rates render (M-2). */}
      <Text style={styles.label}>Trip type · only the rates {profile.displayName} lists</Text>
      <View style={styles.plateRow}>
        {offered.map((t) => {
          const active = draft.tripType === t;
          return (
            <Pressable
              key={t}
              style={[styles.plate, active && styles.plateActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() =>
                setDraft({
                  ...draft,
                  tripType: t,
                  days: clampDays(t, draft.days),
                })
              }
            >
              <Text style={[styles.plateText, active && styles.plateTextActive]}>
                {TRIP_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Date (+ days when multi-day). Platform picker; server takes any valid date. */}
      <Text style={styles.label}>{multi ? "First day" : "Trip date"}</Text>
      {Platform.OS === "ios" ? (
        <View style={styles.dateRow}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="compact"
            minimumDate={new Date()}
            onChange={onPickDate}
          />
        </View>
      ) : (
        <>
          <Pressable
            style={styles.dateButton}
            accessibilityRole="button"
            onPress={() => setShowAndroidPicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {draft.startDate ? draft.startDate : "Pick a date"}
            </Text>
          </Pressable>
          {showAndroidPicker && (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              minimumDate={new Date()}
              onChange={onPickDate}
            />
          )}
        </>
      )}

      {multi && (
        <>
          <Text style={styles.label}>
            Days (consecutive, max {maxDaysFor(draft.tripType)})
          </Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel="Fewer days"
              onPress={() => setDraft({ ...draft, days: clampDays(draft.tripType, draft.days - 1) })}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepCount}>{draft.days}</Text>
            <Pressable
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel="More days"
              onPress={() => setDraft({ ...draft, days: clampDays(draft.tripType, draft.days + 1) })}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* The money block: same numbers from here onward (R4); fee itemized (P-3). */}
      <View style={styles.money}>
        <Text style={styles.moneyLabel}>The numbers · rate set by the crew member</Text>
        {quote ? (
          <>
            <View style={styles.moneyLine}>
              <Text style={styles.moneyDt}>
                {profile.displayName} — {TRIP_TYPE_LABELS[draft.tripType].toLowerCase()}
                {effectiveDaysLabel(draft.tripType, draft.days)}
              </Text>
              <Text style={styles.moneyDd}>{fmtUsd(quote.rateCents)}</Text>
            </View>
            <View style={styles.moneyLine}>
              <Text style={styles.moneyDt}>
                Platform fee ({FEE_PCT},{" "}
                {PLATFORM_FEE_SIDE === "BOAT" ? "paid by the boat" : "deducted from crew payout"})
              </Text>
              <Text style={styles.moneyDd}>{fmtUsd(quote.feeCents)}</Text>
            </View>
            <View style={[styles.moneyLine, styles.moneyTotal]}>
              <Text style={styles.moneyDtTotal}>
                Held at booking, released after the trip + 48h review
              </Text>
              <Text style={styles.moneyDdTotal}>{fmtUsd(quote.totalCents)}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Pick a valid number of days to see the numbers.</Text>
        )}
      </View>

      {/* Rule D-4: insurance attestation is the boat's, recorded at booking. */}
      <Pressable
        style={styles.attestRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.piAttested }}
        onPress={() => setDraft({ ...draft, piAttested: !draft.piAttested })}
      >
        <View style={[styles.checkbox, draft.piAttested && styles.checkboxChecked]}>
          {draft.piAttested && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.attestText}>
          I confirm this vessel carries P&amp;I (protection &amp; indemnity) coverage for this
          trip. Vessel owners are solely responsible for insurance and crew selection.
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        This request forms a booking agreement between <Text style={styles.hintBold}>{boatName}</Text>{" "}
        and <Text style={styles.hintBold}>{profile.displayName}</Text>. Crew Market keeps the
        ledger and holds the funds; it is not a party to the agreement. Cancellation and refund
        terms are stated in the agreement.
      </Text>

      {submitError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Not sent</Text>
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      )}

      <Pressable
        style={[styles.submit, (!ready || busy) && styles.submitDisabled]}
        accessibilityRole="button"
        disabled={!ready || busy}
        onPress={onSubmit}
      >
        <Text style={styles.submitText}>
          {busy
            ? "Sending request…"
            : ready && quote
              ? `Send request — ${fmtUsd(quote.totalCents)} held at booking`
              : "Send request"}
        </Text>
      </Pressable>
      <Text style={styles.hint}>
        {firstName} can accept or decline freely — declining never costs crew anything on Crew
        Market.
      </Text>

      {/* D-2 placement: booking flow (CLAUDE.md hard constraint 6). */}
      <DisclaimerD2 />
    </ScrollView>
  );
}

/** " × 3 days" suffix for the crew line — only when more than one effective day. */
function effectiveDaysLabel(tripType: TripType, days: number): string {
  const eff = maxDaysFor(tripType) === 1 ? 1 : days;
  return eff > 1 ? ` × ${eff} days` : "";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  content: { padding: space.s4, paddingBottom: space.s7, gap: space.s3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s3, backgroundColor: color.boardBg },
  centerText: { fontFamily: font.body, color: color.inkSoft, textAlign: "center", paddingHorizontal: space.s5 },
  retry: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s4 },
  retryText: { fontFamily: font.body, color: color.ink },
  title: { fontFamily: font.display, fontSize: 24, color: color.navyDeep, textTransform: "uppercase" },
  label: { fontFamily: font.mono, fontSize: 11, color: color.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginTop: space.s2 },
  plateRow: { flexDirection: "row", gap: space.s2, flexWrap: "wrap" },
  plate: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s3, backgroundColor: color.whiteCrisp },
  plateActive: { backgroundColor: color.navyDeep, borderColor: color.navyDeep },
  plateText: { fontFamily: font.body, color: color.ink },
  plateTextActive: { color: color.whiteCrisp },
  dateRow: { alignSelf: "flex-start" },
  dateButton: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s3, backgroundColor: color.whiteCrisp, alignSelf: "flex-start" },
  dateButtonText: { fontFamily: font.mono, color: color.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  stepBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, backgroundColor: color.whiteCrisp },
  stepBtnText: { fontFamily: font.display, fontSize: 18, color: color.navyDeep },
  stepCount: { fontFamily: font.mono, fontSize: 16, color: color.ink, minWidth: 28, textAlign: "center" },
  money: { borderWidth: 1, borderColor: color.brassEngrave, borderRadius: radius, backgroundColor: color.whiteCrisp, padding: space.s3, gap: space.s2, marginTop: space.s2 },
  moneyLabel: { fontFamily: font.mono, fontSize: 11, color: color.brassText, textTransform: "uppercase", letterSpacing: 0.5 },
  moneyLine: { flexDirection: "row", justifyContent: "space-between", gap: space.s3 },
  moneyDt: { fontFamily: font.body, color: color.ink, flexShrink: 1 },
  moneyDd: { fontFamily: font.mono, color: color.ink },
  moneyTotal: { borderTopWidth: 1, borderTopColor: color.lineOnWhite, paddingTop: space.s2 },
  moneyDtTotal: { fontFamily: font.body, color: color.navyDeep, flexShrink: 1 },
  moneyDdTotal: { fontFamily: font.mono, color: color.brassText, fontSize: 16 },
  attestRow: { flexDirection: "row", gap: space.s3, marginTop: space.s2 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius, alignItems: "center", justifyContent: "center", backgroundColor: color.whiteCrisp },
  checkboxChecked: { backgroundColor: color.brassText, borderColor: color.brassText },
  checkmark: { color: color.whiteCrisp, fontSize: 14, lineHeight: 16 },
  attestText: { fontFamily: font.body, fontSize: 13, color: color.ink, flex: 1, lineHeight: 18 },
  hint: { fontFamily: font.body, fontSize: 12, color: color.inkSoft, lineHeight: 17 },
  hintBold: { color: color.ink, fontFamily: font.body },
  errorBox: { borderWidth: 1, borderColor: color.lineStrong, borderLeftWidth: 3, borderLeftColor: color.brass, backgroundColor: color.whiteCrisp, borderRadius: radius, padding: space.s3 },
  errorLabel: { fontFamily: font.mono, fontSize: 10, color: color.brassText, textTransform: "uppercase", letterSpacing: 0.5 },
  errorText: { fontFamily: font.body, color: color.ink, marginTop: space.s1 },
  submit: { backgroundColor: color.brassText, borderRadius: radius, paddingVertical: space.s3, alignItems: "center", marginTop: space.s2 },
  submitDisabled: { opacity: 0.45 },
  submitText: { fontFamily: font.display, fontSize: 15, color: color.whiteCrisp, textTransform: "uppercase", letterSpacing: 0.5 },
});
```

- [ ] **Step 3: Regenerate typed routes, then typecheck + lint + test**

Run (each from `apps/mobile` unless noted):
1. `npx expo start` — let it boot until "Metro waiting", then Ctrl-C (this writes `.expo/types/router.d.ts` with the new `/bookings/new` route).
2. `npx tsc --noEmit` — expected: clean.
3. From repo root: `pnpm lint && pnpm --filter mobile test` — expected: clean/PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/bookings/new.tsx apps/mobile/package.json pnpm-lock.yaml
git commit -m "[ai-assisted] feat(mobile): native booking request form — crew-listed trip types, platform date picker, itemized held-funds quote, P&I attestation, D-2 (M-2, M-3, P-3, D-2, D-4, R4) (no rules touched)"
```

---

### Task 6: Profile entry point + stale web copy

**Files:**
- Modify: `apps/mobile/src/app/crew/[id].tsx` (BOOKING panel ~lines 294–317, imports, state, styles)
- Modify: `apps/web/app/crew/[id]/page.tsx:156-165` (BOOKING panel copy)

- [ ] **Step 1: Rewrite the mobile BOOKING panel**

In `crew/[id].tsx`:

1. Imports: remove `Linking` from the react-native import and `WEB_URL` from the
   `lib/api` import (keep `API_URL`; the `WEB_URL` EXPORT in `lib/api.ts` stays —
   it documents the future web/API origin split). Add
   `import { authGuardState } from "../../../lib/auth-guard";`
   (`serverError` is already imported from the shared lib after Task 4).
2. Session: change `const { data: session, isPending } = useSession();` to
   `const { data: session, isPending, error: sessionError } = useSession();` and add
   `const gate = authGuardState({ isPending, session, error: sessionError });`
3. Delete the `const [bookingLinkError, setBookingLinkError] = useState(false);` state.
4. Replace the whole provisional BOOKING panel (the `panelProvisional` View) with:

```tsx
      {/* Booking — native since slice 5. Copy mirrors the web profile's BOOKING
          panel (apps/web/app/crew/[id]/page.tsx). "Funds held" vocabulary only
          (G-1); crew's free decline stated (M-3). CREW accounts get the copy
          without a button (M-2: crew don't request crew). On gate UNKNOWN the
          button still shows — the request screen + API 401 are the authority. */}
      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>BOOKING</Text>
        <Text style={styles.list}>
          Payment is held at booking with the platform fee itemized up front; weather
          cancellation is handled as its own state; payout releases after the trip plus a
          48-hour review window. {firstName} accepts or declines every request at their sole
          discretion.
        </Text>
        {me?.accountType !== "CREW" && (
          <Pressable
            style={styles.requestButton}
            accessibilityRole="button"
            onPress={() =>
              gate === "SIGNED_OUT"
                ? router.push("/sign-in")
                : router.push(`/bookings/new?crew=${profile.id}`)
            }
          >
            <Text style={styles.requestButtonText}>Request {firstName}</Text>
          </Pressable>
        )}
      </View>
```

5. Styles: delete `webButton`, `webButtonText`, and `bookingLinkError` entries;
   delete the `panelProvisional` style ONLY if nothing else uses it (grep first);
   add:

```ts
  requestButton: { backgroundColor: color.brassText, borderRadius: radius, paddingVertical: space.s3, alignItems: "center", marginTop: space.s3 },
  requestButtonText: { fontFamily: font.display, fontSize: 14, color: color.whiteCrisp, textTransform: "uppercase", letterSpacing: 0.5 },
```

- [ ] **Step 2: Trim the stale web copy**

In `apps/web/app/crew/[id]/page.tsx` (~line 156–165), the BOOKING panel paragraph:
delete the sentence `(Demo build: the funds-held step is simulated until payments
go live.)` — payments have been live since 9/14. Nothing else in the paragraph changes.

- [ ] **Step 3: Verify**

Run:
1. `cd apps/mobile && npx tsc --noEmit` — clean (confirms the removed imports/state left no danglers).
2. From root: `pnpm lint && pnpm test && pnpm build && pnpm compliance:check` — all green.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/crew/[id].tsx apps/web/app/crew/[id]/page.tsx
git commit -m "[ai-assisted] feat(mobile): profile BOOKING panel goes native — request button replaces web hand-off; trim stale demo-build copy on web (M-2, M-3, G-1) (no rules touched)"
```

---

### Task 7: Full gates, docs, device pass

**Files:**
- Modify: `HANDOFF.md` (slice-5 record)
- Modify: `docs/SOW-AUDIT.md` (mobile row → 5 of 5, after the device pass)

- [ ] **Step 1: Run every gate from a clean state**

From repo root:

```bash
pnpm lint && pnpm test && pnpm build && pnpm compliance:check
```

Expected: all green. If `next build` fails where vitest passed, suspect the
strict:false union-narrowing rule (see header).

- [ ] **Step 2: Local end-to-end smoke (builder, dev stack)**

1. `colima start && docker compose up -d` (postgres; MinIO not needed this slice).
2. From `apps/web`: `PORT=3002 pnpm dev` (`BETTER_AUTH_URL` in `.env.local` must match — see HANDOFF run recipe).
3. Web smoke: sign in as `boat@example.com`, send one request from the WEB form
   (`/bookings/new?crew=...`) — verifies the Task-2 wrapper end-to-end (ledger
   shows REQUESTED).
4. Mobile smoke (simulator is fine here): `cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:3002 npx expo start`,
   sign in as the boat account, open a crew profile → Request → fill form → send →
   native ledger shows REQUESTED; crew account (`mate@example.com`) sees the
   request in its bookings list.

- [ ] **Step 3: Device pass (REAL USER — physical iPhone; do not claim, ask)**

Announce the checklist and wait for the builder to run it (Expo Go against the
deployed Vercel API or the LAN dev stack — no object store needed this slice):

- Boat account: profile shows "Request <name>" → form opens.
- Trip-type switch updates the quote; multi-day stepper math correct on screen.
- P&I unchecked keeps Send disabled; checking enables it.
- Send → lands on the native ledger in REQUESTED.
- Crew side: the new request appears in the bookings list; spot-check Accept.
- Crew account viewing a profile: no request button, copy renders.
- Signed out: Request routes to sign-in.
- iOS date picker: pick a date next month; the form shows the right date.

Record PASS/FAIL and any findings verbatim from the user. A finding → fix →
re-verify before closing the slice (slice 3/4 precedent).

- [ ] **Step 4: Update docs and commit**

- `HANDOFF.md`: add a slice-5 SHIPPED block (what shipped, device-pass result,
  any findings/fixes, leftovers) after the 9/19 session summary, and update the
  "NEXT SESSION" line (remaining: client policy answers, EAS build, AWS swap).
- `docs/SOW-AUDIT.md`: mobile row → 5 of 5 (only after the device pass PASSES).

```bash
git add HANDOFF.md docs/SOW-AUDIT.md
git commit -m "[ai-assisted] docs: HANDOFF — mobile slice 5 shipped (boat-side booking creation native); SOW-AUDIT mobile 5-of-5 (no rules touched)"
git push
```

---

## Out of scope (from the spec — do not build)

- Availability-date hints or conflict warnings on the form.
- "Request again" prefill from a past booking.
- Any change to accept/decline/pay flows, the state machine, or pricing.
- Rate negotiation.
- Web `/bookings/new` UI changes (it silently benefits from the shared core).
- EAS/standalone build work.
