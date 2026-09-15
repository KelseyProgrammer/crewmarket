# Payments Core (Stripe Connect Express) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real money movement per the approved spec (`docs/superpowers/specs/2026-09-13-payments-core-design.md`): crew Express onboarding, boat pays via Checkout at booking, webhook-confirmed funds-held, tiered refunds on cancellation, lazy idempotent payout after the 48h window.

**Architecture:** Separate charges & transfers — boat's payment is captured into the platform balance at booking (Checkout Session, two itemized line items per P-3); refunds come out of that balance; at release a Transfer moves exactly `rateCents` to the crew's Express account (idempotency key `payout-<bookingId>`), fee kept as remainder. The webhook is the source of truth for the ACCEPTED → ESCROW_FUNDED transition; payout release is lazy on read via the existing `withElapsedWindow`.

**Tech Stack:** `stripe@^22` (upgrade from 17.7.0 — the v2 namespace `stripe.v2.core.accounts` needs it), Prisma migration for 4 id-only columns (P-1), Next.js 15 server actions + one raw-body route handler, vitest with the repo's `vi.hoisted` seam-mock pattern.

**Spec deviation (verified live 2026-09-14):** the sandbox is a new-generation Stripe account with the v1 Accounts API disabled, and the dashboard compatibility flag needs the client's Administrator role. Crew accounts therefore use **Accounts v2** (`v2.core.accounts`, recipient configuration + `dashboard: "express"`) instead of v1 `accounts.create({type:"express"})`. Probed end-to-end with curl on GA version `2026-08-26.dahlia`: account creation, hosted onboarding account link, and close all work. The hosted onboarding UX and everything else in the spec (Checkout, webhook, refunds, v1 Transfers with the v2 account id — interoperable per Stripe docs) are unchanged.

**Compliance frame (binding):** P-1 ids only, never bank/SSN/tax fields. P-2 payout only after COMPLETED + 48h. P-3 fee itemized from `PLATFORM_FEE_RATE` config. M-2 accepting work never gated on payout onboarding. G-1 user copy says "funds held"/"payout", never "escrow" (internal identifiers like `ESCROW_FUNDED` are fine — `pnpm compliance:check` enforces the copy rule). Cite rule IDs in every commit.

**Env preconditions:** Sandbox test keys are already in `.env.local` + `apps/web/.env.local`. `STRIPE_CONNECT_WEBHOOK_SECRET` stays a placeholder until `stripe listen` in Task 10. No dashboard flags needed (Accounts v2). Local DB: `colima start` then `docker compose up -d` from repo root.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/db/prisma/schema.prisma` | +4 nullable Stripe id columns (modify) |
| `packages/payments/src/stripe.ts` | lazy Stripe client singleton (create) |
| `packages/payments/src/refund-tiers.ts` | pure tier config + refund math, no SDK (create) |
| `packages/payments/src/refund-tiers.test.ts` | unit tests for the pure math (create) |
| `packages/payments/src/connect.ts` | Express account / onboarding link / readiness (create) |
| `packages/payments/src/booking-payment.ts` | Checkout Session, refund, transfer (create) |
| `packages/payments/src/webhook.ts` | signature verification (create) |
| `packages/payments/src/index.ts` | re-exports (replace stub) |
| `packages/payments/vitest.config.mts` | node env, `src/**/*.test.ts` (create) |
| `apps/web/app/api/stripe/webhook/route.ts` | raw-body webhook handler (create) |
| `apps/web/app/api/stripe/webhook/route.test.ts` | webhook guard tests (create) |
| `apps/web/app/account/payout-actions.ts` | `beginPayoutOnboarding` server action (create) |
| `apps/web/app/account/payouts-section.tsx` | crew payouts panel on /account (create) |
| `apps/web/app/account/page.tsx` | render PayoutsSection; drop PAYOUTS upcoming tuple (modify) |
| `apps/web/app/bookings/actions.ts` | `beginBookingCheckout`; refund branch; drop ESCROW_CONFIRMED from EVENT_SIDES/TIMESTAMPS (modify) |
| `apps/web/app/bookings/actions.test.ts` | refund-branch tests (create) |
| `apps/web/app/bookings/[id]/page.tsx` | Checkout button swap, confirming note, payout-waiting note (modify) |
| `apps/web/lib/bookings.ts` | `withElapsedWindow` transfer-gated release (modify) |
| `apps/web/lib/bookings.test.ts` | payout release/idempotence tests (create) |
| `scripts/dev-backdate-booking.mjs` | dev-only completedAt backdater for the live drive (create) |
| `HANDOFF.md` | payments run recipe (modify) |

No new booking states and no new events — the exhaustive `Record<BookingState, …>` mirrors (`admin-metrics-rules.ts`, `STATE_LABELS`, `TRAIL`) are untouched.

---

### Task 1: Dependencies + schema migration (P-1: ids only)

**Files:**
- Modify: `packages/db/prisma/schema.prisma:47-83`
- Modify: `packages/payments/package.json`

- [ ] **Step 1: Add workspace deps to packages/payments**

```bash
pnpm --filter @crewmarket/payments add "@crewmarket/types@workspace:*" "stripe@^22"
pnpm --filter @crewmarket/payments add -D vitest
```

After install, sanity-check the v2 namespace exists:

```bash
cd packages/payments && node -e "const S=require('stripe');const s=new S('sk_test_x');console.log(typeof s.v2.core.accounts.create, typeof s.v2.core.accountLinks.create)"
```

Expected: `function function`.

Then add the test script to `packages/payments/package.json` (keep existing fields):

```json
"scripts": { "test": "vitest run" }
```

- [ ] **Step 2: Add the four id columns**

In the `Booking` model, directly under the `state` field (`schema.prisma:57`):

```prisma
  // Stripe ids only (P-1) — Stripe Connect Express owns KYC/bank/tax data.
  stripePaymentIntentId String? // set by the checkout.session.completed webhook
  stripeRefundId        String? // set when a cancellation refund succeeds
  stripeTransferId      String? // set when the crew payout transfer succeeds (exactly-once null-check)
```

In `CrewProfileClaim`, under `userId`:

```prisma
  stripeAccountId String? // Express account id (P-1) — created on "Set up payouts"
```

- [ ] **Step 3: Ensure Postgres is up, run the migration**

```bash
colima start 2>/dev/null || true
docker compose up -d
cd packages/db && pnpm db:migrate --name stripe_ids
```

Expected: `Your database is now in sync with your schema` + generated client. (`packages/db/.env` symlinks to root `.env.local`, so `DATABASE_URL` resolves.)

- [ ] **Step 4: Verify workspace still typechecks/builds**

Run: `pnpm build`
Expected: turbo build passes.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/payments/package.json pnpm-lock.yaml
git commit -m "[ai-assisted] payments: stripe id columns + payments pkg deps (P-1; no rules touched)"
```

---

### Task 2: Pure refund-tier math (TDD)

**Files:**
- Create: `packages/payments/vitest.config.mts`
- Create: `packages/payments/src/refund-tiers.test.ts`
- Create: `packages/payments/src/refund-tiers.ts`

- [ ] **Step 1: Vitest config**

`packages/payments/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: Write the failing tests**

`packages/payments/src/refund-tiers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REFUND_TIERS, isCancelState, refundCentsFor } from "./refund-tiers";

describe("refund tiers (G-1: placeholder config, not policy)", () => {
  it("v1 placeholder is 100% for every cancel state", () => {
    expect(REFUND_TIERS.CANCELLED_WEATHER).toBe(1.0);
    expect(REFUND_TIERS.CANCELLED_BOAT).toBe(1.0);
    expect(REFUND_TIERS.CANCELLED_CREW).toBe(1.0);
  });

  it("refundCentsFor applies the tier and rounds to whole cents", () => {
    expect(refundCentsFor("CANCELLED_WEATHER", 11200)).toBe(11200);
  });

  it("clamps into [0, totalCents] even if a future tier is out of range", () => {
    expect(refundCentsFor("CANCELLED_BOAT", 0)).toBe(0);
  });

  it("isCancelState narrows only the three cancel states", () => {
    expect(isCancelState("CANCELLED_WEATHER")).toBe(true);
    expect(isCancelState("PAID_OUT")).toBe(false);
    expect(isCancelState("ESCROW_FUNDED")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @crewmarket/payments test`
Expected: FAIL — module `./refund-tiers` not found.

- [ ] **Step 4: Implement**

`packages/payments/src/refund-tiers.ts`:

```ts
/** Cancellation refund tiers (G-1): v1 placeholders — real tiers are attorney+client
    input. Code only ever reads this config; nothing else hardcodes percentages. */

export const CANCEL_STATES = ["CANCELLED_WEATHER", "CANCELLED_BOAT", "CANCELLED_CREW"] as const;
export type CancelState = (typeof CANCEL_STATES)[number];

export const REFUND_TIERS: Record<CancelState, number> = {
  CANCELLED_WEATHER: 1.0,
  CANCELLED_BOAT: 1.0,
  CANCELLED_CREW: 1.0,
};

export function isCancelState(state: string): state is CancelState {
  return (CANCEL_STATES as readonly string[]).includes(state);
}

/** Whole cents, clamped to [0, totalCents]. */
export function refundCentsFor(target: CancelState, totalCents: number): number {
  const cents = Math.round(totalCents * REFUND_TIERS[target]);
  return Math.max(0, Math.min(totalCents, cents));
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @crewmarket/payments test`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/payments
git commit -m "[ai-assisted] payments: refund tier config + pure refund math, tested (G-1, P-2; no rules touched)"
```

---

### Task 3: Stripe SDK wrappers + package exports

Thin wrappers around the SDK — no unit tests here (nothing to test but mocks of mocks); they're exercised for real in the Task 10 live drive. All are only ever imported from server actions / route handlers; the lazy client keeps module load env-free so vitest can import the package without keys.

**Files:**
- Create: `packages/payments/src/stripe.ts`
- Create: `packages/payments/src/connect.ts`
- Create: `packages/payments/src/booking-payment.ts`
- Create: `packages/payments/src/webhook.ts`
- Modify: `packages/payments/src/index.ts` (replace stub)

- [ ] **Step 1: Lazy client**

`packages/payments/src/stripe.ts`:

```ts
import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazy singleton: importing this package never requires env; calling it does. */
export function stripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("payments: STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}
```

- [ ] **Step 2: Connect onboarding**

`packages/payments/src/connect.ts` — Accounts v2 (see plan header for why). All request/response shapes below were verified live against the sandbox with curl on `2026-08-26.dahlia`:

```ts
import { stripeClient } from "./stripe";

/** Crew payout account: Accounts v2 recipient configuration with an Express
    dashboard — Stripe owns KYC/bank/tax (P-1); we store the account id only.
    Crew are individual contractors, hence entity_type "individual". */
export async function createExpressAccount(contactEmail: string): Promise<string> {
  const account = await stripeClient().v2.core.accounts.create({
    display_name: contactEmail,
    contact_email: contactEmail,
    identity: { country: "us", entity_type: "individual" },
    dashboard: "express",
    defaults: {
      currency: "usd",
      // Recipient-only accounts require the platform as collector (verified live).
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    },
  });
  return account.id;
}

export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const link = await stripeClient().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
  return link.url;
}

export type PayoutReadiness = { payoutsEnabled: boolean; transfersEnabled: boolean };

/** Fetched live on every read — no mirrored onboarding state (P-1). */
export async function payoutReadiness(accountId: string): Promise<PayoutReadiness> {
  const account = await stripeClient().v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });
  const caps = account.configuration?.recipient?.capabilities?.stripe_balance;
  return {
    payoutsEnabled: caps?.payouts?.status === "active",
    transfersEnabled: caps?.stripe_transfers?.status === "active",
  };
}
```

(If the SDK's TS types for these v2 params lag the API, cast the params object with `as never`/`satisfies` locally rather than downgrading the shapes — the shapes above are the verified wire format. `releaseCrewPayout` stays on the v1 Transfers API — v1 payment APIs accept v2 account ids per Stripe's interop guarantee, verified in the Task 10 live drive.)

- [ ] **Step 3: Checkout, refund, transfer**

`packages/payments/src/booking-payment.ts`:

```ts
import { stripeClient } from "./stripe";

export type CheckoutInput = {
  bookingId: string;
  tripLabel: string; // e.g. "Full day — crew booking"
  rateCents: number;
  feeCents: number;
};
export type CheckoutUrls = { successUrl: string; cancelUrl: string };

/** Separate charges & transfers: full amount captured into the platform balance at
    booking. Two line items itemize the fee (P-3); amount_total = rate + fee. */
export async function createBookingCheckout(
  input: CheckoutInput,
  urls: CheckoutUrls
): Promise<string> {
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: input.rateCents,
          product_data: { name: input.tripLabel },
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: "usd",
          unit_amount: input.feeCents,
          product_data: { name: "Platform fee" },
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId: input.bookingId },
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
  });
  if (!session.url) throw new Error("payments: Checkout Session has no url");
  return session.url;
}

export async function refundBookingPayment(
  paymentIntentId: string,
  refundCents: number
): Promise<string> {
  const refund = await stripeClient().refunds.create({
    payment_intent: paymentIntentId,
    amount: refundCents,
  });
  return refund.id;
}

/** Exactly-once = this idempotency key + the caller's null-check on stripeTransferId. */
export async function releaseCrewPayout(
  bookingId: string,
  accountId: string,
  rateCents: number
): Promise<string> {
  const transfer = await stripeClient().transfers.create(
    { amount: rateCents, currency: "usd", destination: accountId, metadata: { bookingId } },
    { idempotencyKey: `payout-${bookingId}` }
  );
  return transfer.id;
}
```

- [ ] **Step 4: Webhook verification**

`packages/payments/src/webhook.ts`:

```ts
import type Stripe from "stripe";
import { stripeClient } from "./stripe";

/** Throws on a bad signature — the route maps that to a 400. */
export function verifyStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw new Error("payments: STRIPE_CONNECT_WEBHOOK_SECRET is not set");
  return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
```

- [ ] **Step 5: Replace the index stub**

`packages/payments/src/index.ts` (entire file):

```ts
/**
 * @crewmarket/payments — Stripe Connect Express (rules P-1..P-4, G-1).
 * Separate charges & transfers: boat pays into the platform balance at booking
 * (Checkout, fee itemized per P-3); refunds come from that balance; after
 * COMPLETED + 48h (P-2) a Transfer moves rateCents to the crew's Express
 * account. Stripe owns all KYC/bank/tax data — this package touches ids only.
 * Server-side only: import from server actions / route handlers exclusively.
 */
export { createExpressAccount, createOnboardingLink, payoutReadiness } from "./connect";
export type { PayoutReadiness } from "./connect";
export {
  createBookingCheckout,
  refundBookingPayment,
  releaseCrewPayout,
} from "./booking-payment";
export type { CheckoutInput, CheckoutUrls } from "./booking-payment";
export { verifyStripeEvent } from "./webhook";
export { CANCEL_STATES, REFUND_TIERS, isCancelState, refundCentsFor } from "./refund-tiers";
export type { CancelState } from "./refund-tiers";
```

- [ ] **Step 6: Verify build + tests still green**

Run: `pnpm build && pnpm --filter @crewmarket/payments test`
Expected: build passes, 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/payments
git commit -m "[ai-assisted] payments: Express onboarding, Checkout, refund, transfer wrappers (P-1, P-2, P-3; no rules touched)"
```

---

### Task 4: Webhook route (TDD) — source of truth for funds-held

**Files:**
- Create: `apps/web/app/api/stripe/webhook/route.test.ts`
- Create: `apps/web/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Write the failing tests** (repo seam pattern: `vi.hoisted` + `vi.mock`, imports after mocks)

`apps/web/app/api/stripe/webhook/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec: webhook is the source of truth for ACCEPTED -> ESCROW_FUNDED. Guards:
   bad signature -> 400; amount mismatch -> 200 + no transition; replay -> no-op.
   canTransition/transition run for real (pure @crewmarket/types). */

const seams = vi.hoisted(() => ({
  verifyStripeEvent: vi.fn(),
  prisma: { booking: { findUnique: vi.fn(), update: vi.fn() } },
}));

vi.mock("@crewmarket/payments", () => ({ verifyStripeEvent: seams.verifyStripeEvent }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));

import { POST } from "./route";

const BOOKING = { id: "b1", state: "ACCEPTED", rateCents: 10000, feeCents: 1200 };

function session(over: Record<string, unknown> = {}) {
  return {
    id: "cs_1",
    amount_total: 11200,
    payment_intent: "pi_1",
    metadata: { bookingId: "b1" },
    ...over,
  };
}

function completedEvent(over: Record<string, unknown> = {}) {
  return { type: "checkout.session.completed", data: { object: session(over) } };
}

function post(body = "{}", sig = "t=1,v1=sig") {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": sig },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.prisma.booking.findUnique.mockResolvedValue({ ...BOOKING });
  seams.prisma.booking.update.mockResolvedValue({});
});

describe("POST /api/stripe/webhook", () => {
  it("returns 400 on bad signature and never touches the db", async () => {
    seams.verifyStripeEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await post();
    expect(res.status).toBe(400);
    expect(seams.prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 for unhandled event types without db access", async () => {
    seams.verifyStripeEvent.mockReturnValue({ type: "payment_intent.created", data: { object: {} } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it("drives ACCEPTED -> ESCROW_FUNDED, stores the PaymentIntent id, stamps fundsHeldAt", async () => {
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({
        state: "ESCROW_FUNDED",
        stripePaymentIntentId: "pi_1",
        fundsHeldAt: expect.any(Date),
      }),
    });
  });

  it("replay is a no-op: already ESCROW_FUNDED means no update, still 200", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...BOOKING, state: "ESCROW_FUNDED" });
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("amount mismatch: 200, no transition (operator investigates)", async () => {
    seams.verifyStripeEvent.mockReturnValue(completedEvent({ amount_total: 999 }));
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("unknown booking id: 200, no update", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue(null);
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- app/api/stripe/webhook`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement the route**

`apps/web/app/api/stripe/webhook/route.ts`:

```ts
import type Stripe from "stripe";
import { prisma } from "@crewmarket/db";
import { verifyStripeEvent } from "@crewmarket/payments";
import { canTransition, transition, type BookingState } from "@crewmarket/types";

/* Source of truth for funds-held (spec): the booking leaves ACCEPTED only when
   this event arrives — never on the Checkout redirect. Replays and out-of-order
   deliveries are no-ops via canTransition. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = verifyStripeEvent(rawBody, signature);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) {
    console.error(`stripe webhook: session ${session.id} has no bookingId metadata`);
    return Response.json({ received: true });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    console.error(`stripe webhook: no booking ${bookingId} for session ${session.id}`);
    return Response.json({ received: true });
  }

  if (!canTransition(booking.state as BookingState, "ESCROW_CONFIRMED")) {
    return Response.json({ received: true }); // replay or stale delivery
  }

  const expectedCents = booking.rateCents + booking.feeCents;
  if (session.amount_total !== expectedCents) {
    console.error(
      `stripe webhook: amount mismatch on ${bookingId} — got ${session.amount_total}, expected ${expectedCents}`
    );
    return Response.json({ received: true }); // no transition; never trust the redirect
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      state: transition(booking.state as BookingState, "ESCROW_CONFIRMED")!,
      stripePaymentIntentId: paymentIntentId,
      fundsHeldAt: new Date(),
    },
  });

  return Response.json({ received: true });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- app/api/stripe/webhook`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/stripe
git commit -m "[ai-assisted] payments: webhook route — sig check, amount guard, replay no-op, funds-held transition (P-1, P-2; no rules touched)"
```

---

### Task 5: Crew payout onboarding on /account (M-2: optional, never a gate)

**Files:**
- Create: `apps/web/app/account/payout-actions.ts`
- Create: `apps/web/app/account/payouts-section.tsx`
- Modify: `apps/web/app/account/page.tsx` (render section; delete the PAYOUTS tuple at line 26)

- [ ] **Step 1: Server action**

`apps/web/app/account/payout-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import { createExpressAccount, createOnboardingLink } from "@crewmarket/payments";
import { claimedProfileId, sessionUser } from "../../lib/bookings";

/* Payout setup is opt-in from /account only — accepting work is never gated on
   it (M-2). Failure convention matches credential-actions: silent no-op returns
   for wrong-role, redirect for signed-out. */

export async function beginPayoutOnboarding() {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/account");
  if (user.accountType !== "CREW") return;
  const profileId = await claimedProfileId(user.id);
  if (!profileId) return;

  const claim = await prisma.crewProfileClaim.findUnique({ where: { profileId } });
  let accountId = claim?.stripeAccountId ?? null;
  if (!accountId) {
    accountId = await createExpressAccount(user.email);
    await prisma.crewProfileClaim.update({
      where: { profileId },
      data: { stripeAccountId: accountId },
    });
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = await createOnboardingLink(accountId, `${base}/account`, `${base}/account`);
  redirect(url);
}
```

(`redirect()` to an external absolute URL from an action is an established pattern here — `credential-actions.ts:153` already redirects to a presigned S3 URL.)

- [ ] **Step 2: Payouts panel (server component)**

`apps/web/app/account/payouts-section.tsx`:

```tsx
import { prisma } from "@crewmarket/db";
import { payoutReadiness } from "@crewmarket/payments";
import { claimedProfileId } from "../../lib/bookings";
import { beginPayoutOnboarding } from "./payout-actions";

/* Readiness is fetched live from Stripe on every load — no mirrored state (P-1).
   Copy: "funds held"/"payouts", never "escrow" (G-1); setup is optional (M-2). */

export async function PayoutsSection({ userId }: { userId: string }) {
  const profileId = await claimedProfileId(userId);
  if (!profileId) return null;

  const claim = await prisma.crewProfileClaim.findUnique({ where: { profileId } });
  const accountId = claim?.stripeAccountId ?? null;
  const readiness = accountId ? await payoutReadiness(accountId) : null;

  return (
    <section className="account__panel">
      <h2>Payouts</h2>
      {readiness?.payoutsEnabled && readiness.transfersEnabled ? (
        <p>
          Payouts are active. Stripe handles your identity, bank, and tax details — we never
          see them.
        </p>
      ) : (
        <>
          <p>
            {accountId
              ? "Payout setup is started but not finished. Stripe needs a few more details before payouts can go out."
              : "Set up payouts through Stripe to receive your rate after each trip's 48-hour review window. Stripe handles your identity, bank, and tax details — we never see them."}
          </p>
          <p className="mono">Optional — you can accept bookings either way.</p>
          <form action={beginPayoutOnboarding}>
            <button className="btn btn--brass" type="submit">
              {accountId ? "Finish payout setup" : "Set up payouts"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
```

(Match the exact class names used by the surrounding panels in `page.tsx` when wiring — `.account__panel` is the incumbent.)

- [ ] **Step 3: Wire into the page**

In `apps/web/app/account/page.tsx`: import `PayoutsSection`; render it directly after the `CredentialsSection` conditional (lines 76–78), same CREW-only guard:

```tsx
{accountType === "CREW" ? <PayoutsSection userId={session.user.id} /> : null}
```

Delete the now-implemented PAYOUTS tuple from the CREW `upcoming` array (line 26).

- [ ] **Step 4: Verify**

Run: `pnpm --filter web test && pnpm lint && pnpm compliance:check`
Expected: all green (new copy has no banned terms).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account
git commit -m "[ai-assisted] payments: crew payout onboarding via hosted Express flow, live readiness (P-1, M-2, G-1; no rules touched)"
```

---

### Task 6: Boat pays via Checkout redirect

**Files:**
- Modify: `apps/web/app/bookings/actions.ts` (add `beginBookingCheckout`; remove `ESCROW_CONFIRMED` from `EVENT_SIDES` + `TIMESTAMPS`)
- Modify: `apps/web/app/bookings/[id]/page.tsx` (swap the demo button; add confirming note)

- [ ] **Step 1: Add the action**

In `apps/web/app/bookings/actions.ts`, add imports (`createBookingCheckout` from `@crewmarket/payments`; `TRIP_TYPE_LABELS, type TripType` from `@crewmarket/types` if not already imported) and:

```ts
/** Boat's primary action at ACCEPTED: capture into the platform balance via
    Checkout (separate charges & transfers). State does NOT change here — the
    webhook is the source of truth for ESCROW_FUNDED. */
export async function beginBookingCheckout(bookingId: string) {
  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/${bookingId}`);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  const role = await partyRoleFor(booking, user.id);
  if (role !== "BOAT") return;
  if (booking.state !== "ACCEPTED") {
    revalidatePath(`/bookings/${bookingId}`);
    return; // stale tab
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = await createBookingCheckout(
    {
      bookingId,
      tripLabel: `${TRIP_TYPE_LABELS[booking.tripType as TripType]} — crew booking`,
      rateCents: booking.rateCents,
      feeCents: booking.feeCents,
    },
    {
      successUrl: `${base}/bookings/${bookingId}?paid=pending`,
      cancelUrl: `${base}/bookings/${bookingId}`,
    }
  );
  redirect(url);
}
```

- [ ] **Step 2: Retire the simulated event**

Remove the `ESCROW_CONFIRMED: ["BOAT"]` entry from `EVENT_SIDES` (actions.ts:89) and add `"ESCROW_CONFIRMED"` to the `Exclude<...>` in its type:

```ts
const EVENT_SIDES: Record<
  Exclude<BookingEvent["type"], "PAYOUT_SCHEDULED" | "DISPUTE_WINDOW_ELAPSED" | "ESCROW_CONFIRMED">,
  PartyRole[]
> = { ... };
```

Remove `ESCROW_CONFIRMED: "fundsHeldAt"` from `TIMESTAMPS` (the webhook stamps it now). Users can no longer fire the funds-held transition; only the webhook can.

- [ ] **Step 3: Swap the button**

In `apps/web/app/bookings/[id]/page.tsx` ACCEPTED/BOAT block (lines 255–265), replace the `<Event ... event="ESCROW_CONFIRMED" ... demo />` row with:

```tsx
<form action={beginBookingCheckout.bind(null, bookingId)} className="ledger__action-form" key="f">
  <button className="btn btn--brass" type="submit">
    Hold funds — {fmtUsd(totalCents)}
  </button>
</form>
```

Import `beginBookingCheckout` alongside `bookingEventAction`. If the `demo` prop of `Event` now has no callers, delete the prop and its `DEV · SIMULATED` tag branch (lines 203–225).

- [ ] **Step 4: Confirming-payment note**

The page must accept `searchParams` (Next 15 promise style, mirroring `/account/page.tsx`): add `searchParams: Promise<{ paid?: string }>` to the page props and await it. Where the state panel renders, when `paid === "pending" && state === "ACCEPTED"` show:

```tsx
<p className="mono">Payment received by Stripe — confirming the transfer of funds. Refresh in a moment.</p>
```

(Wording avoids "escrow" per G-1; the state badge stays "Accepted" until the webhook lands — spec's "never trust the redirect".)

- [ ] **Step 5: Verify**

Run: `pnpm --filter web test && pnpm lint && pnpm compliance:check && pnpm build`
Expected: all green. (Existing webhook tests from Task 4 still pass — transition unchanged.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/bookings
git commit -m "[ai-assisted] payments: boat pays via Checkout redirect; webhook owns funds-held; simulated button retired (P-2, P-3, G-1; no rules touched)"
```

---

### Task 7: Refunds on cancellation (TDD) — refund first, transition second

**Files:**
- Create: `apps/web/app/bookings/actions.test.ts`
- Modify: `apps/web/app/bookings/actions.ts:100-139` (`bookingEventAction`)

- [ ] **Step 1: Write the failing tests**

`apps/web/app/bookings/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec: from a funded state, compute refundCents from REFUND_TIERS, refund FIRST,
   transition second — a failed refund throws and leaves state unchanged (retryable). */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  partyRoleFor: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { booking: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() } },
  refundBookingPayment: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  partyRoleFor: seams.partyRoleFor,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("@crewmarket/payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createBookingCheckout: vi.fn(),
  refundBookingPayment: seams.refundBookingPayment,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import { bookingEventAction } from "./actions";

const BOAT = { id: "boat1", email: "boat@example.test", accountType: "BOAT" };
const FUNDED = {
  id: "b1",
  state: "ESCROW_FUNDED",
  boatUserId: "boat1",
  crewProfileId: "p1",
  rateCents: 10000,
  feeCents: 1200,
  stripePaymentIntentId: "pi_1",
  stripeRefundId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue(BOAT);
  seams.partyRoleFor.mockResolvedValue("BOAT");
  seams.prisma.booking.update.mockResolvedValue({});
  seams.refundBookingPayment.mockResolvedValue("re_1");
});

describe("bookingEventAction cancellation refunds", () => {
  it("weather cancel from funded: 100% refund first, then transition with refund id stored", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    await bookingEventAction("b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).toHaveBeenCalledWith("pi_1", 11200);
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "CANCELLED_WEATHER", stripeRefundId: "re_1" }),
    });
  });

  it("failed refund: action rejects and the state never changes", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.refundBookingPayment.mockRejectedValue(new Error("stripe down"));
    await expect(bookingEventAction("b1", "CANCEL_WEATHER")).rejects.toThrow("stripe down");
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("cancel from ACCEPTED (nothing captured yet): no refund call", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({
      ...FUNDED,
      state: "ACCEPTED",
      stripePaymentIntentId: null,
    });
    await bookingEventAction("b1", "CANCEL_BOAT");
    expect(seams.refundBookingPayment).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).toHaveBeenCalled();
  });

  it("already-refunded booking never double-refunds", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED, stripeRefundId: "re_0" });
    await bookingEventAction("b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).not.toHaveBeenCalled();
  });
});
```

(If vitest reports the `../../lib/bookings` or `@crewmarket/payments` mock factory is missing an export that `actions.ts` imports, add that name as a `vi.fn()` to the factory — the factory must cover the module's full imported surface.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- app/bookings`
Expected: FAIL — refund never called / no `stripeRefundId` in update data.

- [ ] **Step 3: Implement the refund branch**

In `bookingEventAction`, after the `closedAt` stamping block (actions.ts:132–134) and **before** `prisma.booking.update`:

```ts
// Refund first, transition second (spec): a failed refund throws out of the
// action, leaving the state unchanged and the cancel retryable. Tiers are
// placeholder config, not policy (G-1).
if (isCancelState(next) && booking.stripePaymentIntentId && !booking.stripeRefundId) {
  const refundCents = refundCentsFor(next, booking.rateCents + booking.feeCents);
  if (refundCents > 0) {
    data.stripeRefundId = await refundBookingPayment(booking.stripePaymentIntentId, refundCents);
  }
}
```

Imports: `isCancelState, refundCentsFor, refundBookingPayment` from `@crewmarket/payments`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- app/bookings`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/bookings
git commit -m "[ai-assisted] payments: cancellation refunds — refund-first ordering, tier config, double-refund guard (P-2, G-1; no rules touched)"
```

---

### Task 8: Lazy payout release (TDD) — exactly-once transfer in withElapsedWindow

**Files:**
- Create: `apps/web/lib/bookings.test.ts`
- Modify: `apps/web/lib/bookings.ts:57-75` (`withElapsedWindow`)
- Modify: `apps/web/app/bookings/[id]/page.tsx` (DISPUTE_WINDOW waiting note)

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/bookings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec: at release time, transfer exactly rateCents; PAID_OUT only on transfer
   success; missing onboarding or Stripe failure leaves DISPUTE_WINDOW and retries
   on next read. Exactly-once = idempotency key + null-check on stripeTransferId. */

const seams = vi.hoisted(() => ({
  prisma: {
    booking: { update: vi.fn() },
    crewProfileClaim: { findUnique: vi.fn() },
  },
  releaseCrewPayout: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("@crewmarket/payments", () => ({ releaseCrewPayout: seams.releaseCrewPayout }));
vi.mock("./auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { withElapsedWindow } from "./bookings";

const HOURS = 3600_000;
const base = {
  id: "b1",
  state: "DISPUTE_WINDOW",
  crewProfileId: "p1",
  rateCents: 10000,
  feeCents: 1200,
  completedAt: new Date(Date.now() - 49 * HOURS),
  stripePaymentIntentId: "pi_1",
  stripeTransferId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  seams.prisma.booking.update.mockImplementation(async ({ data }) => ({ ...base, ...data }));
  seams.prisma.crewProfileClaim.findUnique.mockResolvedValue({
    profileId: "p1",
    userId: "u1",
    stripeAccountId: "acct_1",
  });
  seams.releaseCrewPayout.mockResolvedValue("tr_1");
});

describe("withElapsedWindow payout release", () => {
  it("window not elapsed: untouched, no transfer", async () => {
    const b = { ...base, completedAt: new Date(Date.now() - 1 * HOURS) };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
  });

  it("elapsed + onboarded: transfers exactly rateCents, stores id, goes PAID_OUT", async () => {
    await withElapsedWindow({ ...base } as never);
    expect(seams.releaseCrewPayout).toHaveBeenCalledWith("b1", "acct_1", 10000);
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "PAID_OUT", stripeTransferId: "tr_1" }),
    });
  });

  it("crew not onboarded: stays DISPUTE_WINDOW, no transfer, no update", async () => {
    seams.prisma.crewProfileClaim.findUnique.mockResolvedValue({ stripeAccountId: null });
    const b = { ...base };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("transfer failure: stays DISPUTE_WINDOW, retried on next read", async () => {
    seams.releaseCrewPayout.mockRejectedValue(new Error("stripe down"));
    const b = { ...base };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("transfer id already set: no second transfer call, closes normally", async () => {
    await withElapsedWindow({ ...base, stripeTransferId: "tr_0" } as never);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "PAID_OUT" }),
    });
  });

  it("pre-Stripe booking (no PaymentIntent): legacy close without transfer", async () => {
    await withElapsedWindow({ ...base, stripePaymentIntentId: null } as never);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "PAID_OUT" }),
    });
  });
});
```

(If the `./auth` / `next/headers` factories miss an export `lib/bookings.ts` imports, extend the factory — same rule as Task 7.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- lib/bookings`
Expected: FAIL — transfer never called; PAID_OUT reached without transfer.

- [ ] **Step 3: Implement**

Replace the body of `withElapsedWindow` (`lib/bookings.ts:66-75`):

```ts
export async function withElapsedWindow(booking: Booking): Promise<Booking> {
  if (booking.state !== "DISPUTE_WINDOW" || !booking.completedAt) return booking;
  if (!payoutReleasable(booking.state as BookingState, booking.completedAt)) return booking;
  const next = transition(booking.state as BookingState, "DISPUTE_WINDOW_ELAPSED");
  if (!next) return booking;

  // Stripe-funded bookings must transfer before PAID_OUT (P-2). Pre-Stripe
  // (simulated) bookings have no PaymentIntent and close as before. Exactly-once:
  // idempotency key payout-<id> in the payments package + this null-check.
  if (booking.stripePaymentIntentId && !booking.stripeTransferId) {
    const claim = await prisma.crewProfileClaim.findUnique({
      where: { profileId: booking.crewProfileId },
    });
    if (!claim?.stripeAccountId) return booking; // payout waits on setup; retried next read
    try {
      const transferId = await releaseCrewPayout(booking.id, claim.stripeAccountId, booking.rateCents);
      return prisma.booking.update({
        where: { id: booking.id },
        data: { state: next, closedAt: new Date(), stripeTransferId: transferId },
      });
    } catch (err) {
      console.error(`payout release failed for booking ${booking.id}`, err);
      return booking; // stays DISPUTE_WINDOW; retried on next read
    }
  }

  return prisma.booking.update({
    where: { id: booking.id },
    data: { state: next, closedAt: new Date() },
  });
}
```

Import `releaseCrewPayout` from `@crewmarket/payments`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- lib/bookings`
Expected: 6 passing.

- [ ] **Step 5: Ledger waiting note**

In `apps/web/app/bookings/[id]/page.tsx`, the DISPUTE_WINDOW branch of `ActionSlot` (lines 284–291): when the release time has passed but the booking is still in DISPUTE_WINDOW with `stripePaymentIntentId && !stripeTransferId`, render for the CREW role:

```tsx
<p className="mono">
  Payout is waiting on your payout setup — finish it from your account page and this
  releases automatically.
</p>
```

`ActionSlot` will need the booking's `stripePaymentIntentId`, `stripeTransferId`, and `completedAt` (for `payoutReleaseAt`) passed as props if it doesn't already receive the booking row — extend its props accordingly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib apps/web/app/bookings
git commit -m "[ai-assisted] payments: lazy exactly-once crew payout on window elapse; onboarding-gated with retry (P-1, P-2; no rules touched)"
```

---

### Task 9: Full verification pass

- [ ] **Step 1: Whole-workspace gates**

```bash
pnpm lint && pnpm test && pnpm build && pnpm compliance:check
```

Expected: every package green; compliance lint clean (no "escrow" or other M-1-banned classification terms in any new copy).

- [ ] **Step 2: Fix anything red, re-run until green. Commit any fixes.**

---

### Task 10: Live test-mode drive + handoff recipe

Preconditions: Stripe CLI installed and logged in (`brew install stripe/stripe-cli/stripe`, `stripe login`).

**Files:**
- Create: `scripts/dev-backdate-booking.mjs`
- Modify: `HANDOFF.md`
- Modify: `.env.local` + `apps/web/.env.local` (real `whsec_` from `stripe listen`)

- [ ] **Step 1: Backdate script**

`scripts/dev-backdate-booking.mjs` — mirror the Prisma bootstrap of the existing `scripts/sweep-orphan-credentials.mjs` (same client import + env loading), with this behavior:

```js
// Dev-only: backdate a booking's completedAt so the 48h payout window has elapsed.
// Usage: node scripts/dev-backdate-booking.mjs <bookingId> [hoursAgo=49]
const [id, hours = "49"] = process.argv.slice(2);
if (!id) {
  console.error("usage: node scripts/dev-backdate-booking.mjs <bookingId> [hoursAgo]");
  process.exit(1);
}
const completedAt = new Date(Date.now() - Number(hours) * 3600_000);
const row = await prisma.booking.update({ where: { id }, data: { completedAt } });
console.log(`booking ${row.id}: completedAt -> ${completedAt.toISOString()} (state ${row.state})`);
```

- [ ] **Step 2: Start the stack**

```bash
colima start 2>/dev/null || true
docker compose up -d
stripe listen --forward-to localhost:3000/api/stripe/webhook   # terminal 2 — keep running
```

Copy the printed `whsec_...` into `STRIPE_CONNECT_WEBHOOK_SECRET` in **both** `.env.local` and `apps/web/.env.local`, then `pnpm dev` (terminal 3).

- [ ] **Step 3: Drive the full flow** (spec §Testing)

1. Sign in as a claimed CREW account → `/account` → "Set up payouts" → complete Express test onboarding (test data: any name/DOB, SSN `000000000`, phone `0000000000`, any test bank via Stripe's prefilled test values) → back on `/account`, panel shows payouts active.
2. As BOAT: request booking → as CREW accept → as BOAT "Hold funds — $X" → Checkout with card `4242 4242 4242 4242` (any future expiry / CVC / ZIP) → redirect shows "confirming" → `stripe listen` logs `checkout.session.completed` → refresh: state **Funds held**, `fundsHeldAt` stamped.
3. Second booking through the same steps, then weather-cancel from Funds held → booking shows cancelled; refund visible in the sandbox dashboard (Payments → refunded).
4. On booking 1: TRIP_START → TRIP_COMPLETE → `node scripts/dev-backdate-booking.mjs <id>` → load the booking page (lazy release) → state **Paid out**; transfer visible in dashboard (Connect → Transfers), amount exactly `rateCents`.
5. Reload the page twice more → no duplicate transfer (idempotence in the dashboard log).
6. Negative check: fresh CREW account with no payout setup, complete + backdate a funded booking → page shows the payout-waiting note and stays in the review window.

Record any deviation, fix, re-drive.

- [ ] **Step 4: HANDOFF recipe**

Add a "Payments (Stripe sandbox)" section to `HANDOFF.md`: env vars, `stripe listen` recipe, the drive checklist above, backdate script usage, and a note that crew accounts are Accounts v2 (recipient config + Express dashboard) — v1 Accounts API is disabled on this sandbox.

- [ ] **Step 5: Final commit**

```bash
git add scripts/dev-backdate-booking.mjs HANDOFF.md
git commit -m "[ai-assisted] payments: live-drive recipe + backdate helper; sandbox drive verified (P-1..P-3, M-2, G-1; no rules touched)"
```

---

## Self-review notes (spec → task map)

- Spec `packages/payments` exports → Tasks 2–3 (all seven, same names; `payoutReadiness` fetches live, no mirrored state; `createExpressAccount` gained a `contactEmail` param and runs on Accounts v2 — see the header deviation note).
- Spec schema deltas → Task 1 (exact four columns).
- Spec crew onboarding → Task 5 (create-if-none, store id, hosted link, `/account` return/refresh, readiness on load).
- Spec boat payment + "webhook is source of truth" → Tasks 4 & 6 (state untouched by redirect; confirming note).
- Spec webhook guards → Task 4 (400 bad sig; 200 unhandled; amount check against `rateCents + feeCents`; replay no-op via `canTransition`; PI id + `fundsHeldAt` stored; mismatch = log + 200 + no transition).
- Spec refunds → Task 7 (funded states incl. IN_PROGRESS weather — the dispatcher branch keys on the *target* cancel state and PI presence, which covers both; refund-first ordering; id stored).
- Spec payout release → Task 8 (lazy, exactly-once, onboarding-gated with crew-visible note, retry on read; legacy pre-Stripe bookings unaffected).
- Spec unit-test list → Tasks 2, 4, 7, 8. Live drive → Task 10.
- M-2 check: payout onboarding is only reachable from /account and never referenced in accept/decline paths. G-1 check: all new user copy uses "funds held"/"payout"; `pnpm compliance:check` run in Tasks 5, 6, 9.
