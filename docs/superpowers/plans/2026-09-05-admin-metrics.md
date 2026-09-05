# Admin Metrics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unlinked, admin-gated `/admin/metrics` page showing SOW's three metric groups — net revenue (booking-derived, dev-labeled simulated until Stripe), bookings by state, verification counts — aggregates only.

**Architecture:** One server-only data module (`apps/web/lib/admin-metrics.ts`) with pure, TDD'd aggregation helpers and a `computeMetrics()` that runs narrow Prisma selects; `simulatedRevenueFromBookings()` is the isolated swap point for the Stripe phase (SOW 7.iii). One server-rendered page reusing the `/admin/credentials` gate pattern. Spec: `docs/superpowers/specs/2026-09-05-admin-metrics-design.md`.

**Tech Stack:** Next.js 15 RSC, Prisma 6, vitest, existing design tokens.

**Binding conventions:** commits `[ai-assisted] … (rule IDs)`; copy passes `pnpm compliance:check` (M-1); aggregates only — nothing that ranks or lists individual crew earnings (M-2/P-4); no nav links to /admin.

---

### Task 1: Metrics data module (TDD)

**Files:**
- Create: `apps/web/lib/admin-metrics-rules.ts` (pure helpers — no I/O)
- Test: `apps/web/lib/admin-metrics-rules.test.ts`
- Create: `apps/web/lib/admin-metrics.ts` (server-only Prisma assembly)

- [ ] **Step 1: Write the failing tests** (`admin-metrics-rules.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  HELD_FEE_STATES,
  bookingStateCounts,
  splitFees,
  verifiedProfileCount,
} from "./admin-metrics-rules";

describe("bookingStateCounts", () => {
  it("buckets rows into an exhaustive per-state record with zeros for absent states", () => {
    const counts = bookingStateCounts([
      { state: "PAID_OUT" },
      { state: "PAID_OUT" },
      { state: "CANCELLED_WEATHER" },
    ]);
    expect(counts.PAID_OUT).toBe(2);
    expect(counts.CANCELLED_WEATHER).toBe(1);
    expect(counts.REQUESTED).toBe(0);
    expect(Object.keys(counts)).toHaveLength(10); // every machine state present
  });
  it("ignores unknown state strings rather than throwing (defensive against drift)", () => {
    expect(bookingStateCounts([{ state: "NOT_A_STATE" }]).REQUESTED).toBe(0);
  });
});

describe("splitFees", () => {
  it("sums feeCents into realized (PAID_OUT) vs held (funds-held lifecycle) buckets", () => {
    const rows = [
      { state: "PAID_OUT", feeCents: 5000 },
      { state: "PAID_OUT", feeCents: 7000 },
      { state: "ESCROW_FUNDED", feeCents: 1100 },
      { state: "IN_PROGRESS", feeCents: 1200 },
      { state: "COMPLETED", feeCents: 1300 },
      { state: "DISPUTE_WINDOW", feeCents: 1400 },
      { state: "REQUESTED", feeCents: 9999 },        // not yet funded — counts nowhere
      { state: "CANCELLED_WEATHER", feeCents: 9999 }, // cancelled — counts nowhere
    ];
    expect(splitFees(rows)).toEqual({ realizedFeeCents: 12000, heldFeeCents: 5000 });
  });
  it("empty input yields zeros", () => {
    expect(splitFees([])).toEqual({ realizedFeeCents: 0, heldFeeCents: 0 });
  });
});

describe("HELD_FEE_STATES", () => {
  it("is exactly the funds-held lifecycle", () => {
    expect([...HELD_FEE_STATES].sort()).toEqual(
      ["COMPLETED", "DISPUTE_WINDOW", "ESCROW_FUNDED", "IN_PROGRESS"].sort()
    );
  });
});

describe("verifiedProfileCount", () => {
  it("counts distinct profiles, not docs", () => {
    expect(
      verifiedProfileCount([{ profileId: "a" }, { profileId: "a" }, { profileId: "b" }])
    ).toBe(2);
  });
  it("empty input yields zero", () => {
    expect(verifiedProfileCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd apps/web && pnpm test` → FAIL (module not found); existing 13 still pass.

- [ ] **Step 3: Implement the pure module** (`admin-metrics-rules.ts`):

```ts
/* Pure aggregation for the admin metrics dashboard — no I/O, unit-tested.
   Aggregates only: nothing here ranks or lists individual crew (M-2/P-4). */

import type { BookingState } from "@crewmarket/types";

/** Funds-held lifecycle: fee is committed but not yet realized (P-2 window). */
export const HELD_FEE_STATES: ReadonlySet<BookingState> = new Set([
  "ESCROW_FUNDED",
  "IN_PROGRESS",
  "COMPLETED",
  "DISPUTE_WINDOW",
]);

const ZERO_COUNTS: Record<BookingState, number> = {
  REQUESTED: 0,
  ACCEPTED: 0,
  ESCROW_FUNDED: 0,
  IN_PROGRESS: 0,
  COMPLETED: 0,
  DISPUTE_WINDOW: 0,
  PAID_OUT: 0,
  CANCELLED_WEATHER: 0,
  CANCELLED_BOAT: 0,
  CANCELLED_CREW: 0,
};

export function bookingStateCounts(rows: { state: string }[]): Record<BookingState, number> {
  const counts = { ...ZERO_COUNTS };
  for (const row of rows) {
    if (row.state in counts) counts[row.state as BookingState] += 1;
  }
  return counts;
}

/** SOW 7.iii swap point feeds from this shape; realized = PAID_OUT only. */
export function splitFees(rows: { state: string; feeCents: number }[]): {
  realizedFeeCents: number;
  heldFeeCents: number;
} {
  let realizedFeeCents = 0;
  let heldFeeCents = 0;
  for (const row of rows) {
    if (row.state === "PAID_OUT") realizedFeeCents += row.feeCents;
    else if (HELD_FEE_STATES.has(row.state as BookingState)) heldFeeCents += row.feeCents;
  }
  return { realizedFeeCents, heldFeeCents };
}

export function verifiedProfileCount(rows: { profileId: string }[]): number {
  return new Set(rows.map((r) => r.profileId)).size;
}
```

- [ ] **Step 4: Run to verify pass** — `cd apps/web && pnpm test` → all green (13 + 7 new = 20).

- [ ] **Step 5: Server-only assembly** (`admin-metrics.ts`):

```ts
import "server-only";
import { prisma } from "@crewmarket/db";
import type { BookingState } from "@crewmarket/types";
import { bookingStateCounts, splitFees, verifiedProfileCount } from "./admin-metrics-rules";

/* Admin metrics (SOW 2.i). Every figure derives from existing rows — nothing
   hand-entered (SOW 7.iii). Aggregates only (M-2/P-4). */

export type AdminMetrics = {
  revenue: { realizedFeeCents: number; heldFeeCents: number; simulated: true };
  bookings: { total: number; byState: Record<BookingState, number> };
  verification: { verifiedProfiles: number; verifiedDocs: number; awaitingReview: number };
  accounts: { crew: number; boat: number };
};

/**
 * SOW 7.iii swap point: the Stripe phase replaces THIS function with Stripe
 * reporting reads. Until then revenue is derived from booking records and the
 * UI labels it simulated.
 */
async function simulatedRevenueFromBookings(): Promise<AdminMetrics["revenue"]> {
  const rows = await prisma.booking.findMany({ select: { state: true, feeCents: true } });
  return { ...splitFees(rows), simulated: true };
}

export async function computeMetrics(): Promise<AdminMetrics> {
  const [revenue, bookingRows, verifiedDocs, awaitingReview, crew, boat] = await Promise.all([
    simulatedRevenueFromBookings(),
    prisma.booking.findMany({ select: { state: true } }),
    prisma.credentialDoc.findMany({
      where: { verifiedAt: { not: null } },
      select: { profileId: true }, // s3Key not selected — never needed here (V-2)
    }),
    prisma.credentialDoc.count({ where: { verifiedAt: null } }),
    prisma.user.count({ where: { accountType: "CREW" } }),
    prisma.user.count({ where: { accountType: "BOAT" } }),
  ]);
  return {
    revenue,
    bookings: { total: bookingRows.length, byState: bookingStateCounts(bookingRows) },
    verification: {
      verifiedProfiles: verifiedProfileCount(verifiedDocs),
      verifiedDocs: verifiedDocs.length,
      awaitingReview,
    },
    accounts: { crew, boat },
  };
}
```

- [ ] **Step 6: Gates** — `pnpm build` + `pnpm lint` from root green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/admin-metrics-rules.ts apps/web/lib/admin-metrics-rules.test.ts apps/web/lib/admin-metrics.ts
git commit -m "[ai-assisted] admin metrics data layer — TDD aggregation, isolated simulated-revenue swap point (M-2, P-4, V-2; SOW 7.iii)"
```

---

### Task 2: Metrics page + styles

**Files:**
- Create: `apps/web/app/admin/metrics/page.tsx`
- Modify: `apps/web/app/globals.css` (append `.metrics*` styles)

- [ ] **Step 1: Page**

```tsx
import { notFound } from "next/navigation";
import { Container } from "@crewmarket/ui";
import { fmtUsd, type BookingState } from "@crewmarket/types";
import { sessionUser } from "../../../lib/bookings";
import { isAdminEmail } from "../../../lib/credential-rules";
import { computeMetrics } from "../../../lib/admin-metrics";

/* Admin metrics (SOW 2.i): net revenue (simulated until Stripe — SOW 7.iii),
   bookings by state, verification counts. Aggregates only (M-2/P-4).
   Unlinked route, same gate as /admin/credentials. */

// self-documenting defense-in-depth: never statically cached
export const dynamic = "force-dynamic";

export const metadata = { title: "Metrics — Crew Market" };

const STATE_LABELS: Record<BookingState, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  ESCROW_FUNDED: "Funds held",
  IN_PROGRESS: "Under way",
  COMPLETED: "Trip complete",
  DISPUTE_WINDOW: "48h review window",
  PAID_OUT: "Paid out",
  CANCELLED_WEATHER: "Cancelled — weather",
  CANCELLED_BOAT: "Cancelled by boat",
  CANCELLED_CREW: "Cancelled by crew",
};

export default async function AdminMetrics() {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) notFound();

  const m = await computeMetrics();

  return (
    <main className="metrics">
      <Container wide>
        <span className="eyebrow">ADMIN · METRICS</span>
        <h1>Marketplace metrics</h1>

        <div className="metrics__tiles">
          <div className="metrics__tile">
            <span className="eyebrow">NET REVENUE · REALIZED</span>
            <p className="metrics__figure mono">{fmtUsd(m.revenue.realizedFeeCents)}</p>
            <p className="metrics__note">
              Simulated — derived from booking records until Stripe payments go live.
            </p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">FEES ON HELD BOOKINGS</span>
            <p className="metrics__figure mono">{fmtUsd(m.revenue.heldFeeCents)}</p>
            <p className="metrics__note">Funds held or in the 48-hour review window.</p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">BOOKINGS</span>
            <p className="metrics__figure mono">{m.bookings.total}</p>
            <p className="metrics__note">All requests, every state.</p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">VERIFIED CREW PROFILES</span>
            <p className="metrics__figure mono">{m.verification.verifiedProfiles}</p>
            <p className="metrics__note">
              {m.verification.verifiedDocs} document{m.verification.verifiedDocs === 1 ? "" : "s"} reviewed ·{" "}
              {m.verification.awaitingReview} awaiting review
            </p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">ACCOUNTS</span>
            <p className="metrics__figure mono">
              {m.accounts.crew} <span className="metrics__unit">crew</span> · {m.accounts.boat}{" "}
              <span className="metrics__unit">boat</span>
            </p>
            <p className="metrics__note">Registered accounts by side.</p>
          </div>
        </div>

        <section className="metrics__states">
          <span className="eyebrow">BOOKINGS BY STATE</span>
          <table className="metrics__table">
            <tbody>
              {(Object.keys(m.bookings.byState) as BookingState[]).map((s) => (
                <tr key={s}>
                  <td>{STATE_LABELS[s]}</td>
                  <td className="mono">{m.bookings.byState[s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </Container>
    </main>
  );
}
```

- [ ] **Step 2: Styles** — append to `apps/web/app/globals.css`, existing tokens only (match the `.admincreds` block's conventions): `.metrics` (page padding like `.admincreds`), `.metrics__tiles` (responsive grid, `repeat(auto-fit, minmax(220px, 1fr))`, gap `var(--s-4)`), `.metrics__tile` (white panel, `1px solid var(--line-on-white)`, radius, padding), `.metrics__figure` (large mono numeral, `--ink`), `.metrics__unit` + `.metrics__note` (small, `--ink-soft`), `.metrics__states` (top margin), `.metrics__table` (same td/divider treatment as `.admincreds__table`, numeral column right-aligned). No new hex colors.

- [ ] **Step 3: Verify** — `pnpm build` (route `ƒ /admin/metrics`), `pnpm lint`, `pnpm compliance:check`, `cd apps/web && pnpm test` — green. Runtime: logged-out `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/admin/metrics` → 404 (start/stop dev server yourself).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/metrics apps/web/app/globals.css
git commit -m "[ai-assisted] /admin/metrics — gated tiles + state table, simulated-revenue labeling (M-1 copy, M-2, P-4; SOW 7.iii)"
```

---

### Task 3: Docs + final gates

**Files:**
- Modify: `docs/SOW-AUDIT.md`, `HANDOFF.md`

- [ ] **Step 1: SOW-AUDIT** — "Admin Metrics Dashboard | Net revenue, bookings, verified counts" row → `🟡` with note: `/admin/metrics live (unlinked, ADMIN_EMAILS gate): bookings by state, verification counts, accounts; revenue derives from booking feeCents and is dev-labeled simulated — flips to Stripe reporting reads (and ✅) in the Stripe phase (SOW 7.iii)`.

- [ ] **Step 2: HANDOFF** — add a Current state bullet (9/5/2026): admin metrics dashboard live at `/admin/metrics` (same allowlist gate; aggregates only per M-2/P-4; `simulatedRevenueFromBookings()` in `apps/web/lib/admin-metrics.ts` is the marked SOW 7.iii swap point for the Stripe phase). Update the "Next steps" line to drop the metrics dashboard.

- [ ] **Step 3: Final gates** — `pnpm compliance:check` && `pnpm lint` && `(cd apps/web && pnpm test)` && `(cd packages/ui && pnpm test)` && `pnpm build` — all green.

- [ ] **Step 4: Commit** (do NOT push — final review gates the push)

```bash
git add docs/SOW-AUDIT.md HANDOFF.md
git commit -m "[ai-assisted] metrics dashboard: audit row + handoff notes (no rules touched)"
```
