# Plan: Directory Re-Execution (Engraved Registry → client-locked direction)

**Goal:** Replace the directory's visual world with the direction the client locks from the
three probes (artifact `caf986f4`, concept-seed key `cc54bbda`), without breaking any
compliance invariant, and land the shared mechanics now so the world-swap is a small diff later.

**Architecture (current, verified 2026-08-29):** All styling flows through
`packages/ui/src/tokens.css` (CSS custom props) resolved by `apps/web/app/globals.css`;
components in `packages/ui/src/components.tsx` carry classnames only. Fonts load via one
`<link>` in `apps/web/app/layout.tsx:7`. The directory (`apps/web/app/directory/page.tsx`)
is a server-rendered GET form — zero client JS. A world-swap therefore touches tokens,
globals, the font link, and card markup — not data flow.

**Tech stack:** Next.js 15, React 19, pnpm workspaces + Turborepo, TypeScript. No test
runner exists yet (verified: no `test` script in root, `apps/web`, or `packages/ui`).

**Specs / references:**
- Probes + rationale: artifact `https://claude.ai/code/artifact/caf986f4-a504-4e33-8c6b-9e28c17867ae`
- Incumbent system: root `DESIGN.md` (what) + `docs/DESIGN.md` (PFD why)
- Binding constraints: `docs/COMPLIANCE.md` — M-1 vocabulary, M-2 crew-set rates,
  V-1 admin-only seal, V-4 license class + expiry at a glance, D-2 verbatim disclaimer,
  ≤5 chunks per card, exactly 4 filters. `pnpm compliance:check` must stay green after
  every task below.

**Structure:** Phase 0 is direction-agnostic — every task ships value under all three probe
directions (each renders the 14-day availability strip; none changes data flow). It is
executable today, while the client decides. Phase 1 is gated on the client's lock and is
listed as scope, not tasks; its full-granularity plan is written the day the direction locks
(see Decision Gate).

---

## Phase 0 — direction-agnostic mechanics (executable now)

### Task 0.1 — Test infrastructure for `@crewmarket/ui`

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/vitest.config.ts`

**Steps:**

- [ ] Add dev dependencies and test script:
  ```bash
  pnpm --filter @crewmarket/ui add -D vitest react react-dom
  ```
- [ ] In `packages/ui/package.json`, add to the top level:
  ```json
  "scripts": { "test": "vitest run" }
  ```
- [ ] Create `packages/ui/vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: { include: ["src/**/*.test.{ts,tsx}"] },
  });
  ```
- [ ] Verify the runner boots (expected: "no test files found" exit, not a config error):
  ```bash
  pnpm --filter @crewmarket/ui test || true
  ```
- [ ] Commit: `[ai-assisted] vitest infra for @crewmarket/ui (no rules touched)`

### Task 0.2 — `availabilityWindow` helper (TDD)

The strip all three probes share: a fixed-length day window mapped to open/closed booleans.
Pure function, no DOM.

**Files:**
- Create: `packages/ui/src/availability.test.ts`
- Create: `packages/ui/src/availability.tsx`
- Modify: `packages/ui/src/index.ts`

**Interface produced:**
```ts
export type DayCell = { date: string; open: boolean };
export function availabilityWindow(
  av: { date: string; status: string }[],
  start: string,          // "YYYY-MM-DD"
  days?: number           // default 14
): DayCell[];
```

**Steps:**

- [ ] Write `packages/ui/src/availability.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { availabilityWindow } from "./availability";

  const av = [
    { date: "2026-08-29", status: "OPEN" },
    { date: "2026-08-30", status: "BOOKED" },
    { date: "2026-09-02", status: "OPEN" },
  ];

  describe("availabilityWindow", () => {
    it("maps a 14-day window with OPEN days marked", () => {
      const w = availabilityWindow(av, "2026-08-29");
      expect(w).toHaveLength(14);
      expect(w[0]).toEqual({ date: "2026-08-29", open: true });
      expect(w[1]).toEqual({ date: "2026-08-30", open: false }); // BOOKED ≠ open
      expect(w[4]).toEqual({ date: "2026-09-02", open: true });
    });
    it("treats absent dates as closed, never open (M-2: absence is not availability)", () => {
      const w = availabilityWindow([], "2026-08-29");
      expect(w.every((c) => !c.open)).toBe(true);
    });
    it("crosses month boundaries without drift", () => {
      const w = availabilityWindow(av, "2026-08-29");
      expect(w[3].date).toBe("2026-09-01");
      expect(w[13].date).toBe("2026-09-11");
    });
    it("supports a custom window length", () => {
      expect(availabilityWindow(av, "2026-08-29", 7)).toHaveLength(7);
    });
  });
  ```
- [ ] Run and watch it fail (module doesn't exist yet):
  ```bash
  pnpm --filter @crewmarket/ui test
  ```
- [ ] Create `packages/ui/src/availability.tsx`:
  ```tsx
  /* 14-day availability window — shared by all three probe directions
     (duration-as-length encoding; see docs/superpowers/plans/2026-08-29-directory-reexecution.md).
     Rule M-2: a date absent from the list is closed, never assumed open. */

  export type DayCell = { date: string; open: boolean };

  export function availabilityWindow(
    av: { date: string; status: string }[],
    start: string,
    days = 14
  ): DayCell[] {
    const open = new Set(av.filter((a) => a.status === "OPEN").map((a) => a.date));
    const first = new Date(start + "T00:00:00Z");
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(first);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      return { date, open: open.has(date) };
    });
  }
  ```
- [ ] Run to green:
  ```bash
  pnpm --filter @crewmarket/ui test
  ```
- [ ] Add to `packages/ui/src/index.ts` exports:
  ```ts
  export { availabilityWindow, AvailabilityStrip, type DayCell } from "./availability";
  ```
  (The `AvailabilityStrip` named export lands in Task 0.3 — leave the line in place; 0.3's
  component completes it. If committing 0.2 alone, export only `availabilityWindow` and
  `DayCell`, then extend the line in 0.3.)
- [ ] Commit: `[ai-assisted] availabilityWindow helper, TDD (M-2 absence-is-closed)`

### Task 0.3 — `AvailabilityStrip` component (TDD)

Markup-only component (classnames resolved by `globals.css` later, same contract as every
component in `components.tsx`). Rendered by all three directions; each world styles it.

**Files:**
- Create: `packages/ui/src/availability-strip.test.tsx`
- Modify: `packages/ui/src/availability.tsx`

**Interface produced:**
```tsx
export function AvailabilityStrip(props: {
  av: { date: string; status: string }[];
  start: string;
  days?: number;
}): JSX.Element;
```

**Steps:**

- [ ] Write `packages/ui/src/availability-strip.test.tsx` (string assertions via
  `renderToStaticMarkup` — no extra test libs):
  ```tsx
  import { describe, expect, it } from "vitest";
  import { renderToStaticMarkup } from "react-dom/server";
  import { AvailabilityStrip } from "./availability";

  const av = [{ date: "2026-08-29", status: "OPEN" }];

  describe("AvailabilityStrip", () => {
    it("renders one cell per day with open state as a class", () => {
      const html = renderToStaticMarkup(
        <AvailabilityStrip av={av} start="2026-08-29" days={3} />
      );
      expect(html.match(/avail-strip__day/g)).toHaveLength(3);
      expect(html.match(/avail-strip__day--open/g)).toHaveLength(1);
    });
    it("carries an accessible summary with the true open count", () => {
      const html = renderToStaticMarkup(
        <AvailabilityStrip av={av} start="2026-08-29" days={14} />
      );
      expect(html).toContain('aria-label="1 of next 14 days open"');
    });
  });
  ```
- [ ] Run and watch it fail, then append to `packages/ui/src/availability.tsx`:
  ```tsx
  export function AvailabilityStrip({
    av,
    start,
    days = 14,
  }: {
    av: { date: string; status: string }[];
    start: string;
    days?: number;
  }) {
    const window = availabilityWindow(av, start, days);
    const openCount = window.filter((c) => c.open).length;
    return (
      <div
        className="avail-strip"
        role="img"
        aria-label={`${openCount} of next ${days} days open`}
      >
        {window.map((c) => (
          <i
            key={c.date}
            className={`avail-strip__day${c.open ? " avail-strip__day--open" : ""}`}
            data-date={c.date}
          />
        ))}
      </div>
    );
  }
  ```
- [ ] Run to green:
  ```bash
  pnpm --filter @crewmarket/ui test
  ```
- [ ] Confirm the export line from Task 0.2 now resolves (typecheck via build):
  ```bash
  pnpm --filter web build
  ```
- [ ] Commit: `[ai-assisted] AvailabilityStrip component, TDD (unstyled until direction lock)`

### Task 0.4 — D-2 verbatim invariant test

Locks the disclaimer component to `docs/COMPLIANCE.md`'s exact sentence so no future
restyle can paraphrase it (D-2 requires verbatim).

**Files:**
- Create: `packages/ui/src/disclaimer.test.tsx`

**Steps:**

- [ ] Write `packages/ui/src/disclaimer.test.tsx`:
  ```tsx
  import { describe, expect, it } from "vitest";
  import { renderToStaticMarkup } from "react-dom/server";
  import { DisclaimerD2 } from "./components";

  const D2 =
    "Crew Market is a directory and booking marketplace. We are not an employer, " +
    "crewing agency, or vessel operator. Vessel owners are solely responsible for " +
    "crew selection, vessel operation, and legal compliance including insurance.";

  describe("DisclaimerD2 (rule D-2)", () => {
    it("renders the COMPLIANCE.md sentence verbatim", () => {
      const text = renderToStaticMarkup(<DisclaimerD2 />)
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      expect(text).toBe(D2);
    });
  });
  ```
- [ ] Run to green (it should pass immediately against the existing component; if it fails,
  the component drifted — fix the component, never the constant):
  ```bash
  pnpm --filter @crewmarket/ui test
  ```
- [ ] Commit: `[ai-assisted] D-2 verbatim invariant test (rule D-2)`

**Phase 0 exit criteria:** `pnpm --filter @crewmarket/ui test` green (7 tests),
`pnpm compliance:check` green, `pnpm --filter web build` green, no visible change to the
running site (the strip exists but nothing renders it yet — the incumbent look is untouched
until the client locks a direction).

---

## Decision Gate — client locks a direction (A / B / C / re-roll)

Phase 1 cannot be written to this plan's granularity without the lock: fonts, tokens, and
card markup differ per direction. **The day the client answers, write
`docs/superpowers/plans/YYYY-MM-DD-directory-<direction>.md` at full task granularity**
covering, in order:

1. **Fonts** — replace the Google `<link>` in `apps/web/app/layout.tsx:7` with the locked
   direction's faces via `next/font/google` (self-hosted at build; kills FOUT, satisfies the
   layout comment's own TODO). A: Allerta Stencil + Archivo + Martian Mono ·
   B: Chakra Petch + Archivo + Martian Mono · C: Oswald + Archivo + Martian Mono.
2. **Tokens** — rewrite `packages/ui/src/tokens.css` palette/type/radius vars to the locked
   probe's values (probe CSS in `scratchpad/probes.html` is the source; brass AA split
   `#a9822f`/`#8a6a1e` carries over unchanged in all three).
3. **Card + surface markup** — restyle `CrewCard`, filters, masthead, footer in
   `apps/web/app/globals.css`; wire `AvailabilityStrip` into `CrewCard` (replacing the
   "Next open" fact cell to hold the ≤5-chunk budget); remove the `eyebrow` line per the
   locked world (all three probes dropped it; port moves into the role line).
4. **Finish pipeline (impeccable)** — batched screenshot round (desktop + mobile), craft-floor
   fixes, spawn `impeccable-finish-reviewer` with the direction contract, then the
   documenter rewrites root `DESIGN.md` from the built world and `docs/DESIGN.md` gets a
   PFD Mode-2 addendum (R1–R5 for the new world). Re-run `pnpm compliance:check`.
5. **Cascade** — crew profile pages, sign-up, account shell, booking flow (Voyage Ledger
   brief) inherit the new tokens; Expo mobile parity flagged as its own follow-up plan.

**Execution note:** run Phase 1 with Superpowers' `executing-plans` (inline) or
subagent-driven execution — install first: `/plugin install superpowers@claude-plugins-official`.

---

## Self-review (per writing-plans checklist)

- **Spec coverage:** strip encoding (all probes) → 0.2/0.3; D-2 → 0.4; M-2
  absence-is-closed → 0.2; direction-specific work → gated, named, dated.
- **Placeholder scan:** Phase 0 contains none. Phase 1 is intentionally scope-not-tasks,
  gated on a client decision, with the follow-up plan file named.
- **Type consistency:** `availabilityWindow` signature matches between 0.2 test, 0.2
  implementation, and 0.3's component; `DayCell` exported once from `availability.tsx`.
