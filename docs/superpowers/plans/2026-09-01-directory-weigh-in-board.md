# Plan: Directory Phase 1 — The Weigh-In Board (direction C, client-locked 2026-09-01)

**Goal:** Swap the directory's visual world from Engraved Registry to Probe C, "The Weigh-In
Board" (tournament board rows, monumental condensed caps, no cards), wire in the Phase 0
`AvailabilityStrip`, and cascade tokens to the other surfaces — with every compliance
invariant intact.

**Decision record:** Client locked **Probe C — challenger** from artifact `caf986f4`
(concept-seed key `cc54bbda`) on 2026-09-01. Probe thesis, verbatim:

> WORLD: tournament weigh-in board — monumental condensed caps, full-width rows, no cards.
> Raise from the alphabet-storm challenger: type as matter, at scale. **Guard: no rank
> numbers anywhere — order is the visitor's filter, never a score (M-2/P-4).**

That guard is a binding design law for this phase: no ordinals, no "REG 001" plates, no
leaderboard numbering. The board lists; it never ranks.

**Architecture (verified 2026-09-01, unchanged from Phase 0 plan):** styling flows through
`packages/ui/src/tokens.css` → `apps/web/app/globals.css` (355 lines); components in
`packages/ui/src/components.tsx` carry classnames only; fonts load via one `<link>` at
`apps/web/app/layout.tsx:7`; directory (`apps/web/app/directory/page.tsx`) is a
server-rendered GET form, zero client JS — that stays true (row hover/invert is pure CSS).
Phase 0 landed: `availabilityWindow` + `AvailabilityStrip` in `packages/ui/src/availability.tsx`
(7 tests green), D-2 verbatim invariant test.

**Probe C source values** (extracted from the artifact; `scratchpad/probes.html` from the
probe session is gone — the artifact is now the canonical source):

- **Fonts:** Oswald (500 row names, 700 banner h1; condensed caps) · Archivo (400/600 body)
  · Martian Mono (400, data/labels). All Google faces.
- **Palette:** page `#f6f7f8` · ink `#10222f` · navy `#0a1d30` · white `#f8fafb` ·
  brass-bright `#d7b36a` · brass AA split `#a9822f` / `#8a6a1e` (carries over unchanged) ·
  dim `#4a5c6b` · mist `#8fa6ba` · muted-on-navy `#b7c6d4` · lines `rgba(16,34,47,.14/.16/.3)`.
- **Radius:** 2px (unchanged). Rows are white on `#f6f7f8`, `border-bottom` 1px line;
  filters bar white with 2px navy bottom rule; boardhead labels in Martian Mono 8.5px
  letterspaced caps; **row hover inverts to navy** (`background #0a1d30`, text `#f8fafb`,
  rate flips brass-bright); focus-visible `3px solid #a9822f` inset.
- **Row cells (6-col grid `minmax(220px,2.2fr) 1fr 1fr .7fr .9fr 1.1fr`):** name (Oswald 500
  uppercase, clamp 22–32px, brass sealchip inline when verified) · port + role (dim) ·
  license + expiry with `passed admin review` / `self-reported` subline (V-1/V-4) ·
  seasons (tabular mono, small label) · day rate (mono 17px, small label **"sets own rate"**,
  M-2 microcopy) · availability cell.
- **Banner:** navy, Oswald 700 uppercase clamp(40px,7vw,84px), one word in brass em; copy is
  the same M-1-vetted sentences the directory already carries.
- **Responsive:** ≤880px boardhead hidden, row becomes 2-col grid with name full-width;
  ≤560px filters stack. `prefers-reduced-motion`: no row transition.

**Binding constraints:** `docs/COMPLIANCE.md` — M-1 vocabulary, M-2 crew-set rates +
absence-is-closed, V-1 admin-only seal, V-4 license class + expiry at a glance, D-2 verbatim
(locked by Phase 0 test), ≤5 chunks per row, exactly 4 filters, **no rank numbers (probe
guard, M-2/P-4)**. `pnpm compliance:check` must stay green after every task.

**Chunk budget (R1) accounting for the row:** ① name+seal · ② port/role · ③ license line ·
④ the numbers pair (seasons + rate share one tabular band under boardhead labels) ·
⑤ availability strip + next-open. The finish review (Task 1.6) re-audits this.

---

## Task 1.1 — Fonts: `next/font/google`, kill the `<link>`

Satisfies the layout comment's own TODO (self-hosted at build, no FOUT). Requires network
at build time — fine on this machine.

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Steps:**

- [ ] Replace the `FONTS_HREF` const and the three `<head>` lines (preconnect ×2 + stylesheet)
  with:
  ```tsx
  import { Oswald, Archivo, Martian_Mono } from "next/font/google";

  const display = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--next-font-display" });
  const body = Archivo({ subsets: ["latin"], weight: ["400", "600"], variable: "--next-font-body" });
  const mono = Martian_Mono({ subsets: ["latin"], weight: "400", variable: "--next-font-mono" });
  ```
- [ ] Add the variables to the root element:
  ```tsx
  <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
  ```
  (Drop the now-empty `<head>` if nothing else remains in it.)
- [ ] `tokens.css` already resolves `--next-font-*` first, so the wiring is done — the
  fallback strings update in Task 1.2, not here.
- [ ] Verify: `pnpm --filter web build` green.
- [ ] Commit: `[ai-assisted] directory C: next/font Oswald/Archivo/Martian Mono (no rules touched)`

## Task 1.2 — Tokens: rewrite `tokens.css` to the Weigh-In Board palette

**Files:**
- Modify: `packages/ui/src/tokens.css`

**Steps:**

- [ ] Rewrite the header comment (world is now "tournament weigh-in board"; brass still
  carries exactly two meanings: verification and the primary action).
- [ ] Palette block — keep: `--navy-deep #0a1d30`, `--white-crisp #f8fafb`,
  `--brass #a9822f`, `--brass-text #8a6a1e` (AA split unchanged), `--brass-bright #d7b36a`,
  `--mist #8fa6ba`, `--ink #10222f`, `--ink-soft #4a5c6b`, `--line-on-white`,
  `--line-on-navy`, `--brass-engrave`. Add: `--board-bg: #f6f7f8`,
  `--navy-muted: #b7c6d4`, `--line-strong: rgba(16, 34, 47, 0.3)`. Drop `--navy-panel`
  only if Task 1.5's sweep shows nothing still uses it — otherwise keep.
- [ ] Type block fallbacks:
  ```css
  --font-display: var(--next-font-display, "Oswald", "Archivo", sans-serif);
  --font-body: var(--next-font-body, "Archivo", system-ui, sans-serif);
  --font-mono: var(--next-font-mono, "Martian Mono", ui-monospace, monospace);
  ```
- [ ] Keep `.eyebrow` and `.rule-brass` for now — landing/profile/account still use them
  until Task 1.5; the directory itself stops using eyebrows in Task 1.4.
- [ ] Verify: `pnpm --filter web build` && `pnpm compliance:check` green.
- [ ] Commit: `[ai-assisted] directory C: weigh-in board tokens, brass AA split kept (M-1 lint green)`

## Task 1.3 — `CrewCard` → board row (TDD)

The registry plate becomes a full-width board row. The `index` prop (REG-number ordinal)
is **deleted** — that's the probe's no-rank guard made structural. `AvailabilityStrip`
replaces the "Next open" fact cell (Phase 0 plan, decision-gate item 3); the eyebrow line
goes away (port moves into the meta cell).

**Files:**
- Create: `packages/ui/src/components.test.tsx`
- Modify: `packages/ui/src/components.tsx`
- Modify: `apps/web/app/directory/page.tsx` (call site only, full restyle is Task 1.4)
- Check/modify call sites: `apps/web/app/page.tsx`, `apps/web/app/crew/[id]/page.tsx`
  (grep confirmed these are the only other `CrewCard`/eyebrow surfaces that can break the
  typecheck).

**New interface:**
```tsx
export function CrewCard(props: {
  crew: CrewCardData;
  href?: string;
  windowStart: string; // "YYYY-MM-DD" — deterministic, derived from seed, never new Date()
}): JSX.Element;
```

**Steps:**

- [ ] Write `packages/ui/src/components.test.tsx` first (renderToStaticMarkup, same pattern
  as the Phase 0 tests) against a minimal `CrewCardData` fixture:
  ```tsx
  import { describe, expect, it } from "vitest";
  import { renderToStaticMarkup } from "react-dom/server";
  import { CrewCard, type CrewCardData } from "./components";

  const base: CrewCardData = {
    id: "x", displayName: "Mack Whitcombe", roles: ["CAPTAIN"], homePort: "Key West, FL",
    dayRateUsd: 550, yearsExperience: 23, fisheries: ["sailfish"],
    credentials: [{ kind: "USCG_LICENSE", licenseClass: "Master 50T", expiresAt: "2027-03-01", verified: true }],
    availability: [{ date: "2026-08-28", status: "OPEN" }],
    stats: { tripsCompleted: 10 },
  };
  const html = (crew: CrewCardData) =>
    renderToStaticMarkup(<CrewCard crew={crew} windowStart="2026-08-28" />);

  describe("CrewCard — weigh-in board row", () => {
    it("renders no rank/registry ordinal (probe guard, M-2/P-4)", () => {
      expect(html(base)).not.toMatch(/REG\s|#\d/);
    });
    it("renders the 14-day availability strip (M-2 absence-is-closed)", () => {
      expect(html(base).match(/avail-strip__day(?!-)/g)).toHaveLength(14);
    });
    it("carries the crew-set-rates microcopy on the rate cell (M-2)", () => {
      expect(html(base)).toContain("sets own rate");
    });
    it("shows the seal only for admin-verified credentials (V-1)", () => {
      const un = { ...base, credentials: [{ ...base.credentials[0], verified: false }] };
      expect(html(base)).toContain("seal");
      expect(html(un)).not.toContain("seal");
      expect(html(un)).toContain("self-reported");
    });
    it("keeps license class + expiry at a glance (V-4)", () => {
      expect(html(base)).toContain("Master 50T");
      expect(html(base)).toContain("2027-03");
    });
  });
  ```
- [ ] Run and watch the new file fail: `pnpm --filter @crewmarket/ui test`
- [ ] Rewrite `CrewCard` in `components.tsx`: signature above; markup shape (classnames
  resolved by globals.css in Task 1.4):
  ```tsx
  <article className={`row${verified ? " row--verified" : ""}${href ? " row--linked" : ""}`}>
    <h3 className="row__name">{verified && <VerifiedSeal small />}{name-or-anchor}</h3>
    <p className="row__meta">{homePort}<br />{roles joined " · "}</p>
    <p className="row__lic">{licenseClass} · exp {expiresAt.slice(0, 7)}
      <i>{license.verified ? "passed admin review" : "self-reported"}</i></p>
    <p className="row__yrs mono">{yearsExperience}<small>seasons</small></p>
    <p className="row__rate mono">${dayRateUsd}<small>sets own rate</small></p>
    <div className="row__avail">
      <AvailabilityStrip av={crew.availability} start={windowStart} />
      <small className="mono">{next open date ?? "Booked out"}</small>
    </div>
  </article>
  ```
  Keep `nextOpenDate`; delete the eyebrow/`index` code. Fisheries move out of the row
  (profile page keeps them) — the board is six cells under one labels row, five chunks.
- [ ] Update the three call sites: drop `index`, pass
  `windowStart` (directory computes `const windowStart = all.flatMap(c => c.availability.map(a => a.date)).sort()[0]`
  — deterministic from seed, honest under M-2: profiles whose window starts later render
  leading days closed).
- [ ] Run to green: `pnpm --filter @crewmarket/ui test` (12 tests) and `pnpm --filter web build`.
- [ ] Commit: `[ai-assisted] directory C: CrewCard → board row, rank ordinal deleted, strip wired (M-2, V-1, V-4, P-4)`

## Task 1.4 — Directory surface: banner, filters, boardhead, row styling

**Files:**
- Modify: `apps/web/app/directory/page.tsx`
- Modify: `apps/web/app/globals.css`

**Steps:**

- [ ] `directory/page.tsx`: replace the eyebrow+h1+meta block with the probe's banner —
  navy section, `h1` "The crew <em>board</em>", the existing (already M-1-vetted) meta
  copy as the banner paragraph with "brass seal" emphasized. Keep the form exactly as-is
  (4 filters, GET). After the form add the boardhead labels row:
  ```tsx
  <div className="boardhead" aria-hidden="true">
    <span>Crew</span><span>Home port · role</span><span>License</span>
    <span>Seasons</span><span>Day rate</span><span>Next 14 days</span>
  </div>
  ```
  Replace `.grid` with `<div className="board">`; add a mono count line
  (`{results.length} of {all.length} listed` — a count, never a rank). Keep the empty state.
- [ ] `globals.css`: translate the probe's `.pc` rules onto the token vars —
  body/main `--board-bg`; banner per probe (`h1` clamp(40px,7vw,84px), Oswald via
  `--font-display`, `em` brass-bright not italic); filters bar white, `--line-strong`
  borders, 2px navy bottom rule, labels Oswald 500 11px letterspaced; `.boardhead`
  (Martian Mono 8.5px .16em caps, hidden ≤880px); `.row` 6-col grid per probe, white,
  hover inverts navy with rate flipping brass-bright, `:focus-visible` 3px `--brass` inset;
  sealchip styling reuses `VerifiedSeal` colors (brass radial only when verified);
  `.avail-strip` styled here for the first time: 14 flex cells, open = `--brass` fill,
  closed = transparent with `--line-on-white` rule — brass here *is* bookable-state
  information, consistent with the strip's role-img aria label. Responsive + reduced-motion
  blocks per probe. Delete the `.plate*` rules once nothing references them.
- [ ] Verify no ordinal anywhere on the page (view source: no `REG`, no numbering).
- [ ] `pnpm --filter web build` && `pnpm compliance:check` && `pnpm --filter @crewmarket/ui test` green.
- [ ] Commit: `[ai-assisted] directory C: weigh-in board surface — banner, boardhead, row world (M-1, M-2, D-2 intact)`

## Task 1.5 — Cascade: landing, crew profile, sign-up/sign-in, account

These inherit the new fonts/palette automatically the moment 1.1–1.2 land; this task fixes
what inheritance gets wrong (serif-era styling assumptions), it does not redesign them.

**Files:**
- Modify: `apps/web/app/globals.css` (hero/profile/auth/account sections)
- Modify (only if markup must change): `apps/web/app/page.tsx`, `apps/web/app/crew/[id]/page.tsx`,
  `apps/web/app/sign-up/page.tsx`, `apps/web/app/sign-in/page.tsx`, `apps/web/app/account/page.tsx`

**Steps:**

- [ ] Sweep every `--font-display` consumer: Oswald wants uppercase + tighter line-height
  where Caslon wanted italics — `hero__title` (em → brass color, not italic),
  `profile__name`, auth/account headings. Profile head keeps its plate-style panel but
  adopts board borders (`--line-strong` + navy rule) so the world reads as one system.
- [ ] D-2 placements untouched (footer, sign-up, profile, booking brief) — the Phase 0
  verbatim test and compliance lint both guard this.
- [ ] Check `--navy-panel` usage; resolve per Task 1.2 note.
- [ ] `pnpm --filter web build` && `pnpm compliance:check` green; eyeball every route via
  `pnpm dev`.
- [ ] Commit: `[ai-assisted] directory C cascade: landing/profile/auth/account inherit board world (D-2 placements intact)`

## Task 1.6 — Finish pipeline + design record

**Steps:**

- [ ] Impeccable finish round: batched screenshots (desktop + mobile) of `/`, `/directory`
  (filtered + empty states), `/crew/[id]`, `/sign-up`; fix craft-floor findings; spawn
  `impeccable-finish-reviewer` with the direction contract = the Probe C thesis + guard
  quoted at the top of this plan.
- [ ] `/impeccable document`: rewrite root `DESIGN.md` from the built world (incumbent
  record, per CLAUDE.md); add a PFD Mode-2 addendum to `docs/DESIGN.md` (R1–R5 re-derived
  for the weigh-in board; note the chunk accounting above).
- [ ] Re-run `pnpm compliance:check` (root-level md is scanned too).
- [ ] Commit: `[ai-assisted] directory C: finish pass + DESIGN.md rewritten for weigh-in board (M-1 lint green)`

---

**Phase 1 exit criteria:** `pnpm --filter @crewmarket/ui test` green (12 tests),
`pnpm compliance:check` green, `pnpm --filter web build` green, zero rank ordinals in any
rendered surface, D-2 verbatim everywhere it was, brass carries only verification +
primary action (+ the strip's bookable-state fill, recorded in DESIGN.md), all four SOW
filters functionally unchanged, directory still zero client JS.

**Execution:** Superpowers `executing-plans`, one task per commit, stop at any red gate.

**Follow-ups out of scope here:** booking flow (Voyage Ledger) builds *on* these tokens per
`docs/BOOKING_BRIEF.md`; Expo mobile parity is its own plan.

## Self-review (writing-plans checklist)

- **Spec coverage:** decision-gate items 1–5 → Tasks 1.1, 1.2, 1.3+1.4, 1.6, 1.5. Probe
  guard (no ranks) is structural (prop deleted) *and* tested. Strip wiring honors Phase 0's
  stated intent.
- **Placeholder scan:** none — every task names files, values, and verify commands.
- **Type consistency:** `CrewCard` new signature matches test, implementation, and all
  three call sites; `windowStart` derivation is deterministic (no `new Date()` in a server
  component).
- **Compliance:** every commit message cites rule IDs; three green gates run at every task.
