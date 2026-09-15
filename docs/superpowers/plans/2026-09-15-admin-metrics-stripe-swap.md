# Admin Metrics — Stripe Revenue Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated booking-derived revenue figure on `/admin/metrics` with real Stripe-sourced numbers (gross platform fee retained, from balance transactions), per `docs/superpowers/specs/2026-09-15-admin-metrics-stripe-swap-design.md` (SOW 7.iii).

**Architecture:** A pure aggregation function over Stripe balance transactions lives in `packages/payments` (unit-tested, no I/O); a thin `stripeRevenue()` does the paginated Stripe reads; `computeMetrics()` in apps/web calls it behind a 60s TTL cache with an env/error fallback to the existing simulated figure; the metrics page branches its revenue tiles on a `source` discriminant. Non-revenue tiles untouched.

**Tech Stack:** stripe@^22 (installed), the lazy `stripeClient()` (existing), the apps/web `ttl-cache` util (existing), vitest with the repo's `vi.hoisted` seam pattern.

**Compliance:** SOW 7.iii (Stripe-derived, never hand-entered), P-1 (ids/amounts only, no new PII), M-2/P-4 (aggregates only — nothing ranks or lists crew), M-1 (copy lint). Cite rule IDs in commits.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/payments/src/revenue.ts` | pure `aggregateBalanceTransactions` + `sumUsdBalance`; I/O `stripeRevenue()` (create) |
| `packages/payments/src/revenue.test.ts` | unit tests for the pure aggregation (create) |
| `packages/payments/src/index.ts` | export `stripeRevenue`, `StripeRevenue` (modify) |
| `apps/web/lib/admin-metrics.ts` | revenue discriminated union; Stripe path + cache + fallback (modify) |
| `apps/web/lib/admin-metrics.test.ts` | fallback + Stripe-path tests (create) |
| `apps/web/app/admin/metrics/page.tsx` | branch revenue tiles on `source` (modify) |
| `apps/web/app/globals.css` | only if a new tile needs a style hook (modify, maybe) |

---

### Task 1: Pure balance-transaction aggregation (TDD)

**Files:**
- Create: `packages/payments/src/revenue.test.ts`
- Create: `packages/payments/src/revenue.ts`

- [ ] **Step 1: Write the failing tests**

`packages/payments/src/revenue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateBalanceTransactions, sumUsdBalance } from "./revenue";

describe("aggregateBalanceTransactions (SOW 7.iii: gross platform fee retained)", () => {
  it("sums charges, subtracts refunds and transfers; ignores other types", () => {
    const txns = [
      { type: "charge", amount: 67200 },
      { type: "payment", amount: 33600 },
      { type: "refund", amount: -67200 },
      { type: "transfer", amount: -30000 },
      { type: "stripe_fee", amount: -195 },
      { type: "payout", amount: -1000 },
    ];
    const r = aggregateBalanceTransactions(txns);
    expect(r.grossChargesCents).toBe(100800);
    expect(r.refundsCents).toBe(67200);
    expect(r.crewPayoutsCents).toBe(30000);
    expect(r.platformFeesRetainedCents).toBe(100800 - 67200 - 30000);
  });

  it("empty list is all zeros", () => {
    expect(aggregateBalanceTransactions([])).toEqual({
      grossChargesCents: 0,
      refundsCents: 0,
      crewPayoutsCents: 0,
      platformFeesRetainedCents: 0,
    });
  });

  it("payment_refund counts as a refund", () => {
    const r = aggregateBalanceTransactions([
      { type: "charge", amount: 1000 },
      { type: "payment_refund", amount: -400 },
    ]);
    expect(r.refundsCents).toBe(400);
    expect(r.platformFeesRetainedCents).toBe(600);
  });
});

describe("sumUsdBalance", () => {
  it("sums usd amounts, ignores other currencies", () => {
    expect(
      sumUsdBalance([
        { amount: 5000, currency: "usd" },
        { amount: 200, currency: "usd" },
        { amount: 999, currency: "eur" },
      ])
    ).toBe(5200);
  });
  it("empty is zero", () => {
    expect(sumUsdBalance([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @crewmarket/payments test -- revenue`
Expected: FAIL — module `./revenue` not found.

- [ ] **Step 3: Implement the pure functions**

`packages/payments/src/revenue.ts`:

```ts
import { stripeClient } from "./stripe";

export type StripeRevenue = {
  grossChargesCents: number;
  refundsCents: number;
  crewPayoutsCents: number;
  platformFeesRetainedCents: number;
  availableCents: number;
  pendingCents: number;
};

type Txn = { type: string; amount: number };

/** Gross platform fee retained (SOW 7.iii): charges − refunds − crew transfers.
    Gross of Stripe's own processing fees (stripe_fee/payout/topup are ignored). */
export function aggregateBalanceTransactions(txns: Txn[]): Omit<
  StripeRevenue,
  "availableCents" | "pendingCents"
> {
  let grossChargesCents = 0;
  let refundsCents = 0;
  let crewPayoutsCents = 0;
  for (const t of txns) {
    if (t.type === "charge" || t.type === "payment") grossChargesCents += t.amount;
    else if (t.type === "refund" || t.type === "payment_refund") refundsCents += -t.amount;
    else if (t.type === "transfer") crewPayoutsCents += -t.amount;
  }
  return {
    grossChargesCents,
    refundsCents,
    crewPayoutsCents,
    platformFeesRetainedCents: grossChargesCents - refundsCents - crewPayoutsCents,
  };
}

export function sumUsdBalance(entries: { amount: number; currency: string }[]): number {
  return entries.filter((e) => e.currency === "usd").reduce((s, e) => s + e.amount, 0);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @crewmarket/payments test -- revenue`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/payments/src/revenue.ts packages/payments/src/revenue.test.ts
git commit -m "[ai-assisted] metrics: pure balance-transaction aggregation for platform fees retained, tested (SOW 7.iii; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 2: `stripeRevenue()` I/O + export

No unit tests for the raw I/O paging (exercised via the computeMetrics tests in Task 3 and the live check); keep it thin.

**Files:**
- Modify: `packages/payments/src/revenue.ts` (append `stripeRevenue`)
- Modify: `packages/payments/src/index.ts`

- [ ] **Step 1: Append the I/O function**

In `packages/payments/src/revenue.ts`:

```ts
const MAX_PAGES = 50; // 5,000 txns — revisit with a date window before real volume

/** Reads the platform's balance transactions (auto-paginated) + current balance.
    Authoritative money-movement source for the admin revenue tile (SOW 7.iii). */
export async function stripeRevenue(): Promise<StripeRevenue> {
  const client = stripeClient();
  const txns: Txn[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.balanceTransactions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const t of res.data) txns.push({ type: t.type, amount: t.amount });
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
    if (page === MAX_PAGES - 1) {
      console.warn("stripeRevenue: hit MAX_PAGES cap; totals may be truncated");
    }
  }

  const balance = await client.balance.retrieve();
  return {
    ...aggregateBalanceTransactions(txns),
    availableCents: sumUsdBalance(balance.available),
    pendingCents: sumUsdBalance(balance.pending),
  };
}
```

- [ ] **Step 2: Export**

In `packages/payments/src/index.ts` add:

```ts
export { stripeRevenue, aggregateBalanceTransactions, sumUsdBalance } from "./revenue";
export type { StripeRevenue } from "./revenue";
```

- [ ] **Step 3: Verify build + existing tests**

Run: `pnpm --filter @crewmarket/payments test && pnpm build`
Expected: payments tests green, build passes.

- [ ] **Step 4: Commit**

```bash
git add packages/payments/src/revenue.ts packages/payments/src/index.ts
git commit -m "[ai-assisted] metrics: stripeRevenue() — paginated balance transactions + available/pending balance (SOW 7.iii, P-1; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 3: Rewire `computeMetrics` — union + cache + fallback (TDD)

**Files:**
- Create: `apps/web/lib/admin-metrics.test.ts`
- Modify: `apps/web/lib/admin-metrics.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/admin-metrics.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  prisma: {
    booking: { findMany: vi.fn() },
    credentialDoc: { findMany: vi.fn(), count: vi.fn() },
    user: { count: vi.fn() },
  },
  stripeRevenue: vi.fn(),
}));

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("@crewmarket/payments", () => ({ stripeRevenue: seams.stripeRevenue }));

import { computeMetrics } from "./admin-metrics";

beforeEach(() => {
  vi.clearAllMocks();
  seams.prisma.booking.findMany.mockResolvedValue([
    { state: "PAID_OUT", feeCents: 7200 },
    { state: "ESCROW_FUNDED", feeCents: 3600 },
  ]);
  seams.prisma.credentialDoc.findMany.mockResolvedValue([]);
  seams.prisma.credentialDoc.count.mockResolvedValue(0);
  seams.prisma.user.count.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());

describe("computeMetrics revenue source", () => {
  it("falls back to simulated when STRIPE_SECRET_KEY is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const m = await computeMetrics();
    expect(m.revenue.source).toBe("simulated");
    expect(seams.stripeRevenue).not.toHaveBeenCalled();
    if (m.revenue.source === "simulated") {
      expect(m.revenue.realizedFeeCents).toBe(7200);
      expect(m.revenue.heldFeeCents).toBe(3600);
    }
  });

  it("uses Stripe when the key is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    seams.stripeRevenue.mockResolvedValue({
      grossChargesCents: 100800, refundsCents: 67200, crewPayoutsCents: 30000,
      platformFeesRetainedCents: 3600, availableCents: 194450, pendingCents: 66125,
    });
    const m = await computeMetrics();
    expect(m.revenue.source).toBe("stripe");
    if (m.revenue.source === "stripe") {
      expect(m.revenue.platformFeesRetainedCents).toBe(3600);
      expect(m.revenue.availableCents).toBe(194450);
    }
  });

  it("falls back to simulated if Stripe throws", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    seams.stripeRevenue.mockRejectedValue(new Error("stripe down"));
    const m = await computeMetrics();
    expect(m.revenue.source).toBe("simulated");
  });
});
```

Note: if `computeMetrics` caches `stripeRevenue`, the test must avoid cross-test cache bleed — either the cache key includes nothing stable across these mocks (each returns deterministically) or the cache TTL util is imported real; if a cached value leaks between the "uses Stripe" and "throws" tests, wrap the `stripeRevenue` call so the cache stores only on success (a rejected promise must not be cached). Implement the cache so failures are not cached (see Step 3).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- admin-metrics`
Expected: FAIL — `revenue.source` undefined / current shape has `simulated` boolean.

- [ ] **Step 3: Implement**

Rewrite the revenue portion of `apps/web/lib/admin-metrics.ts`:

```ts
import "server-only";
import { prisma } from "@crewmarket/db";
import type { BookingState } from "@crewmarket/types";
import { stripeRevenue, type StripeRevenue } from "@crewmarket/payments";
import { bookingStateCounts, splitFees, verifiedProfileCount } from "./admin-metrics-rules";
import { ttlCache } from "./ttl-cache"; // confirm the exact export name/signature first

type Revenue =
  | ({ source: "stripe" } & StripeRevenue)
  | { source: "simulated"; realizedFeeCents: number; heldFeeCents: number };

export type AdminMetrics = {
  revenue: Revenue;
  bookings: { total: number; byState: Record<BookingState, number> };
  verification: { verifiedProfiles: number; verifiedDocs: number; awaitingReview: number };
  accounts: { crew: number; boat: number };
};

function simulatedRevenue(rows: { state: string; feeCents: number }[]): Revenue {
  return { source: "simulated", ...splitFees(rows) };
}

// 60s cache: one platform-wide aggregate. Only successful reads are cached
// (a rejected stripeRevenue() must not poison the window — see fallback below).
async function stripeRevenueCached(): Promise<StripeRevenue> {
  return ttlCache("admin:stripe-revenue", 60_000, stripeRevenue);
}

async function revenueFor(rows: { state: string; feeCents: number }[]): Promise<Revenue> {
  if (!process.env.STRIPE_SECRET_KEY) return simulatedRevenue(rows);
  try {
    return { source: "stripe", ...(await stripeRevenueCached()) };
  } catch (err) {
    console.error("admin metrics: stripeRevenue failed, falling back to simulated", err);
    return simulatedRevenue(rows);
  }
}
```

`computeMetrics()` then does `revenue: await revenueFor(bookingRows)` and keeps the rest unchanged.

**Adapt to the real `ttl-cache` API** — read `apps/web/lib/ttl-cache.ts` first and match its signature. If its shape doesn't fit an async loader that skips caching rejections, either use it only around the resolved value or add a minimal module-level memo `{ value, expiresAt }` here instead. The invariant that MUST hold: a thrown `stripeRevenue()` is never cached.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- admin-metrics`
Expected: 3 passing. Full suite: `pnpm --filter web test`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin-metrics.ts apps/web/lib/admin-metrics.test.ts
git commit -m "[ai-assisted] metrics: computeMetrics revenue = Stripe (cached) with simulated fallback on missing key / error (SOW 7.iii, M-2; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 4: Metrics page revenue tiles branch on source

**Files:**
- Modify: `apps/web/app/admin/metrics/page.tsx`
- Modify: `apps/web/app/globals.css` (only if a sub-note style is needed)

- [ ] **Step 1: Branch the revenue tiles**

Replace the two revenue tiles (currently `PLATFORM FEES · REALIZED` and `FEES ON HELD BOOKINGS`) with a `source` branch. Read the current tile markup and match its classes exactly.

**`stripe` branch:**

```tsx
<div className="metrics__tile">
  <span className="eyebrow">PLATFORM FEES · RETAINED</span>
  <p className="metrics__figure mono">{fmtUsd(m.revenue.platformFeesRetainedCents)}</p>
  <p className="metrics__note">
    {fmtUsd(m.revenue.grossChargesCents)} in · {fmtUsd(m.revenue.refundsCents)} refunded ·{" "}
    {fmtUsd(m.revenue.crewPayoutsCents)} to crew
  </p>
  <p className="metrics__note">Derived from Stripe balance transactions (SOW 7.iii).</p>
</div>
<div className="metrics__tile">
  <span className="eyebrow">BALANCE</span>
  <p className="metrics__figure mono">
    {fmtUsd(m.revenue.availableCents)} <span className="metrics__unit">available</span>
  </p>
  <p className="metrics__note">
    {fmtUsd(m.revenue.pendingCents)} still settling — charges clear in ~2 days.
  </p>
</div>
```

**`simulated` branch:** keep the current two tiles verbatim (realized/held + the simulated note).

Use a TS discriminant check (`m.revenue.source === "stripe"`) so the fields type-narrow.

- [ ] **Step 2: Verify**

Run: `pnpm --filter web test && pnpm lint && pnpm compliance:check && pnpm build`
Expected: all green (new copy has no banned terms).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/admin/metrics/page.tsx apps/web/app/globals.css
git commit -m "[ai-assisted] metrics: revenue tiles render Stripe money-flow + balance, simulated fallback preserved (SOW 7.iii, M-2, G-1; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 5: Full verification + live check + push

- [ ] **Step 1: Whole-workspace gates**

```bash
pnpm lint && pnpm test && pnpm build && pnpm compliance:check
```

Fix anything red; re-run until green.

- [ ] **Step 2: Live check (keys present, stack running)**

With `PORT=3002 pnpm dev` up and signed in as an `ADMIN_EMAILS` user, load `/admin/metrics`. Confirm the retained figure ≈ (charges − refunds − crew payouts) and available/pending match the Stripe test dashboard for the 9/14 drive's charges/refunds/transfers. (Note: the drive's manual top-up/probe transfers appear in balance transactions — expected test-mode noise.)

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-review notes (spec → task map)

- Spec §1 pure aggregation + I/O → Tasks 1 & 2 (types + type-mapping exact; MAX_PAGES cap logged, no silent truncation).
- Spec §2 union + cache + fallback → Task 3 (env-missing and error both fall back; rejections never cached).
- Spec §3 UI branch → Task 4 (money-flow + balance tiles for stripe; simulated tiles preserved).
- Spec §4 compliance → gates in Tasks 3–5 (M-1 lint; aggregates only; P-1 amounts only).
- Spec §5 testing → unit in Tasks 1 & 3; live check in Task 5.
- Non-revenue tiles (bookings-by-state, verification, accounts) never touched — confirmed in Task 4 scope.
