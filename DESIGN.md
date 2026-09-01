---
name: Crew Market
description: Tournament weigh-in board — one monumental board of full-width rows in navy, white, and brass
colors:
  navy-deep: "#0a1d30"
  navy-panel: "#12314e"
  white-crisp: "#f8fafb"
  board-bg: "#f6f7f8"
  row-face: "#ffffff"
  brass: "#a9822f"
  brass-text: "#8a6a1e"
  brass-text-hover: "#7d5f1b"
  brass-bright: "#d7b36a"
  mist: "#8fa6ba"
  navy-muted: "#b7c6d4"
  ink: "#10222f"
  ink-soft: "#4a5c6b"
  line-on-white: "rgba(16, 34, 47, 0.14)"
  line-strong: "rgba(16, 34, 47, 0.3)"
  line-on-navy: "rgba(143, 166, 186, 0.28)"
  brass-engrave: "rgba(169, 130, 47, 0.45)"
typography:
  display-banner:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "clamp(40px, 7vw, 84px)"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "0.005em"
  display-hero:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "clamp(34px, 5.4vw, 58px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "0.005em"
  title-row:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "clamp(22px, 2.6vw, 32px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.01em"
  title-page:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
  title-minor:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
  title-plate:
    fontFamily: "Oswald, Archivo, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  body-hero:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  body-ui:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-meta:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label-nav:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
  label:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.12em"
  label-micro:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.12em"
  label-boardhead:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "8.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.16em"
  label-cell:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "8px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
rounded:
  plate: "2px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.brass-text}"
    textColor: "#ffffff"
    rounded: "{rounded.plate}"
    padding: "14px 22px"
  button-primary-hover:
    backgroundColor: "{colors.brass-text-hover}"
  button-ghost-navy:
    backgroundColor: "transparent"
    textColor: "{colors.white-crisp}"
    rounded: "{rounded.plate}"
    padding: "14px 22px"
  button-ghost-ink:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "14px 22px"
  board-row:
    backgroundColor: "{colors.row-face}"
    textColor: "{colors.ink}"
    padding: "12px 16px"
  board-row-hover:
    backgroundColor: "{colors.navy-deep}"
    textColor: "{colors.white-crisp}"
  board-panel:
    backgroundColor: "{colors.row-face}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "24px"
  input-field:
    backgroundColor: "{colors.white-crisp}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "10px 12px"
---

# Design System: Crew Market

## Overview

**Creative North Star: "The Weigh-In Board"**

Crew Market's interface is a tournament weigh-in board: the kind of official results board posted
at a South Florida dock, read natively by the audience as *the institution speaking*. The directory
is one monumental board of full-width rows — never a card grid. A deep navy field carries the
banner, masthead, and footer; white rows sit on a cool grey board ground; monumental condensed
caps (Oswald) are the matter of the page, not decoration on it; and brass appears only where it
has a defined meaning, like metal hardware on a boat. Hovering a row inverts it to navy — the
board lights the lane you're on. This world replaced the retired "Engraved Registry" system
wholesale (direction locked by the client 2026-09-01: probe C, concept-seed cc54bbda index 6,
artifact caf986f4).

Crucially, the board **lists — it never ranks**. A board of rows wants to read as a leaderboard;
the system refuses that structurally, because implied ranking is a compliance hazard
(M-2/P-4), not just a taste call.

This file records the built system for on-brand generation — the *what*. The derivation rationale
(the PFD requirement stack and its restatement for this world) lives in `docs/DESIGN.md`,
section 4 — the *why*. Keep that division.

**Key Characteristics:**
- One monumental board: full-width white rows on a grey ground under a navy banner — no cards
- Brass as a closed ledger of meanings: verification, primary action, open-day fill, display accent
- Oswald condensed caps as matter, Archivo body, Martian Mono data — self-hosted via next/font
- Flat, edge-drawn surfaces; 2px "plate" radius; row hover inverts to navy
- Exactly one authored motion moment (the availability strip painting in on row hover)
- Compliance-bound copy: marketplace vocabulary only (M-1), D-2 disclaimer persistent, no ranks

## Colors

Three hues plus disciplined neutrals; navy and white are the fields, brass is the meaning.

### Primary
- **Navy Deep** (#0a1d30): The institutional field — banner, masthead, hero, footer, and the row
  hover/inversion state. The hero adds latitude hairlines (repeating 1px lines of Mist at ~0.1
  alpha) as sub-attentional texture.
- **Brass** (#a9822f): The meaning-carrying metal, split by duty into two finishes. **Graphic
  brass** (#a9822f) is for drawn things at ≥3:1 — the seal ring, the availability strip's open-day
  fill, focus outlines on white, border warms on hover. **Brass Text** (#8a6a1e, 5.05:1 on white)
  is for every text-sized use on white — links, seal label, badge text, error labels — and is the
  primary-button fill (hover deepens to #7d5f1b). Never graphic brass for small text on white.

### Secondary
- **Brass Bright** (#d7b36a): Brass on navy — the wordmark's "Market", the single `em` word in
  display headlines, hovered nav links and ghost-navy borders, focus outlines on navy fields, the
  hovered row's rate and open-day cells, and the text-selection highlight. Never a background fill.

### Neutral
- **Board Ground** (#f6f7f8): The page body background; rows and panels sit white on it.
- **Row Face** (#ffffff): Board rows, panels, the filters bar, auth panel — the pure-white plane.
- **White Crisp** (#f8fafb): Text on navy fields; input backgrounds on white panels.
- **Ink** (#10222f) / **Ink Soft** (#4a5c6b): Body and secondary text on white.
- **Mist** (#8fa6ba): Secondary text on navy — nav links at rest, hero subtitle, footer, and the
  hovered row's demoted meta text.
- **Navy Muted** (#b7c6d4): Long-form text on navy (the banner meta paragraph).
- **Navy Panel** (#12314e): The raised-on-navy tone; currently carries the weather-cancellation
  badge text (information, never error-red drama).
- **Line on White** (rgba(16,34,47,.14)) / **Line Strong** (rgba(16,34,47,.3)) /
  **Line on Navy** (rgba(143,166,186,.28)) / **Brass Engrave** (rgba(169,130,47,.45)):
  Hairline borders; Brass Engrave is the verification edging and the navy-field seam
  (masthead bottom, footer top).

### Named Rules
**The Brass Ledger Rule.** Brass carries exactly four meanings and no others: **verification**
(the seal coin and brass-engrave edging), **the primary action**, **the availability strip's
open-day fill** (bookable-state data, not mood), and **the display accent** (the wordmark's
"Market"; at most one `em` word per display headline). Any fifth meaning dilutes all four. Small
text on white always uses the text-grade #8a6a1e.

**The Two-Field Rule.** Every section is either navy field or white-on-board-ground; the two never
blend, gradient, or overlap mid-section. Transitions happen at hard section boundaries. Emphasis
inside running text on navy is by weight (white, 600), never by brass — brass in running text
would dilute the seal.

## Typography

**Display Font:** Oswald 500/700 (with Archivo, sans-serif)
**Body Font:** Archivo 400/600 (with system-ui, sans-serif)
**Data/Label Font:** Martian Mono 400 (with ui-monospace, monospace)

All three are self-hosted at build via `next/font` in `apps/web/app/layout.tsx` (no FOUT);
`tokens.css` resolves the `--next-font-*` variables.

**Character:** Monumental condensed caps as the matter of the page — dockside results-board
authority — over structured Archivo utility, with Martian Mono carrying every piece of data
furniture (column labels, microlabels, badges, legal lines). All display and title type is
uppercase. The pairing reads tournament-official, not SaaS.

### Hierarchy
- **Display Banner** (700, clamp(40px, 7vw, 84px), 0.96): The directory banner ("THE CREW BOARD")
  only. One brass-bright `em` word maximum.
- **Display Hero** (700, clamp(34px, 5.4vw, 58px), 1.02): Landing hero; max-width 16ch, balanced
  wrap, one brass-bright `em` phrase.
- **Title Row** (500, clamp(22px, 2.6vw, 32px), 1.0): Crew names on board rows.
- **Title Page** (500, 32px, 1.05): Profile and account page names.
- **Headline** (500, 28px, ~1.2): Section headings and the auth panel title.
- **Title Minor** (500, 18–22px): Account status lines, role-fork plate names, the 22px wordmark
  (letter-spacing 0.04em).
- **Body** (400 Archivo, 16px, 1.55): Prose; hero subtitle at 17px; UI text at 15px; meta at
  13–14px; measure 62ch (`--measure`).
- **Label** (400 Martian Mono, 10–12px, UPPERCASE): Nav links (12px/0.14em), badges, form labels,
  legal lines (11px), fact labels and license lines (10px). Tracking varies 0.08–0.14em by
  context; 0.12em is the default.
- **Boardhead Label** (400 Martian Mono, 8.5px, 0.16em, UPPERCASE): The board's column-label row.
- **Cell Microlabel** (400 Martian Mono, 8px, 0.14em, UPPERCASE, 0.6 opacity): The per-cell units
  under data values ("seasons", "sets own rate", "next open …").

### Named Rules
**The Locked Ramp Rule.** The ramp's extremes — clamp(40px, 7vw, 84px) banner display, 8.5px
boardhead labels, 8px cell microlabels — are client-locked values from the direction lock
(artifact caf986f4) and are suppressed as sanctioned in the design detector config
(`.impeccable/config.json` → `detector.ignoreValues`). Do not "normalize" them; do not extend the
ramp past them either.

**The Data-Is-Mono Rule.** Every numeric or registry-flavored string — column labels, license
class + expiry, tabular values (with `font-variant-numeric: tabular-nums`), state badges, counts,
legal lines — is Martian Mono uppercase. Archivo never carries data furniture; Oswald never drops
below title size.

## Layout

Max content width 1080px (1240px `container--wide` — the board surfaces all run wide) with 24px
side padding, on a strict 4px spacing grid (tokens s1–s9: 4/8/12/16/24/32/48/64/96).

The board is a six-column CSS grid shared by the boardhead and every row:
`minmax(220px, 2.2fr) 1fr 1fr 0.7fr 0.9fr 1.1fr` with 16px gaps — name, port/role, license,
seasons, day rate, 14-day availability. Rows are full-width, separated by 1px hairlines, flush
against each other; the boardhead closes with a 2px navy rule. The banner runs generous vertical
space and bottom-aligns its title and meta paragraph. Panels (profile, auth, account) are white
plates on the board ground.

Responsive: at 880px the boardhead disappears and rows reflow to a two-column grid (name and
availability span full width — the cell microlabels carry the column meanings); at 760px trail
steps go 4→2 (→1 at 480px); at 560px the masthead wraps to an authored two-row layout (wordmark,
then all four nav links spread across one row) and filters stack full-width. Density is
board-monumental above the fold, calm-institutional below.

### Named Rules
**The No-Rank Rule.** No ordinals, rank numbers, position badges, or sequential registry furniture
anywhere on the board or any listing surface — order is the visitor's filter, never a score
(compliance M-2/P-4). `CrewCard` has no ordinal prop by design and a unit test asserts none
renders. Counts are census, never position: "25 of 25 listed", never "#1".

## Elevation & Depth

Effectively flat: depth is drawn with edges — hairline borders, 2px navy bottom rules, brass-engrave
inset edging on verified surfaces — and with field contrast between navy and white. Exactly two
shadows exist and both are sanctioned: the filters bar's grounding shadow
(`0 10px 20px -14px rgba(16,34,47,0.35)`), which seats the one console-like control on the board,
and the seal coin's coined relief (`inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 2px
rgba(16,34,47,0.35)`), which makes verification read as struck metal. Nothing else casts a shadow.
Hover "lift" is expressed as full inversion to navy, never as elevation. If a surface must feel
raised on navy, use Navy Panel (#12314e).

### Named Rules
**The Drawn-Edge Rule.** New surfaces earn separation with a border or a 2px navy rule, not a
shadow. The two shadows above are the closed set.

## Shapes

2px radius everywhere ("plate, not pill") — panels, buttons, inputs, badges. The recurring
silhouette is the full-width row: squared, flush, hairline-separated. Weight-bearing plates
(filters bar, profile head, profile disclaimer) close with a 2px navy bottom edge, like a plate
bolted to the board. Dashed hairline borders mark provisional or empty surfaces (booking panel,
upcoming-bookings panel, empty state). The only circle in the system is the verification seal —
coin on the board, engraved ring on profiles — and its roundness against the squared board is
what makes it read as a seal. No skews, blobs, or organic shapes.

## Components

### Masthead
Navy bar with brass-engrave bottom hairline. Oswald 500 uppercase wordmark at 22px — "Crew" in
white, "Market" in Brass Bright (a Brass Ledger display-accent slot). Mono uppercase nav links
(12px/0.14em) in Mist, Brass Bright on hover. Baseline-aligned single row; authored two-row wrap
at 560px.

### Buttons
- **Shape:** plate (2px radius), 14px 22px padding, 600-weight Archivo at 15px.
- **Primary** (`btn--brass`): Brass Text fill (#8a6a1e, AA on white text), hover deepens to
  #7d5f1b. One primary action per screen.
- **Ghost navy / ghost ink:** transparent with hairline border (line-on-navy / line-on-white);
  hover warms the border and text to brass (Brass Bright on navy, Brass/Brass Text on white).
- **Focus:** 2px brass outline, 2px offset (Brass Bright outline on navy fields).

### Board Row (CrewCard) — the signature component
One crew listing as one full-width board row on the six-column grid; white face, hairline bottom
border. Anatomy is capped at **five chunks**: ① seal coin + Oswald name, ② port / roles,
③ license class + expiry with `passed admin review` / `self-reported` stated in words, in italic
(V-1: self-reported ≠ verified), ④ the tabular seasons + day-rate pair — the rate carries the M-2
microcopy "sets own rate" at the point of comparison, ⑤ the 14-day availability strip with
next-open date. Nothing may be added without removing something.

The whole row is the hit area (the name anchor's `::after` covers the row). Hover inverts the row
to navy — text to white, meta to Mist, rate to Brass Bright — and repaints the availability strip
(see below). `focus-within` draws a 3px brass outline inset −3px. No ordinal prop exists.

### Boardhead
The column-label row rendered once for the whole board (`aria-hidden`, since each cell repeats its
meaning in microlabels): 8.5px/0.16em mono uppercase in Ink Soft, closed by the 2px navy rule.
Hidden below 880px.

### Verified Seal
Rendered **only** when an admin-set `credential.verified` is true (rule V-1). Two renderings:
- **Board coin** (26px): a filled brass coin — radial gradient from Brass Bright to Brass with
  coined-relief shadow — carrying a navy check, sized to read at scan distance beside 32px names.
  Its text label is visually hidden; the license cell says "passed admin review" in words.
- **Profile ring**: the engraved circular SVG (solid ring, dashed inner ring, square-capped check)
  in graphic brass with a mono "VERIFIED" label in Brass Text. Verified profile heads also edge in
  brass-engrave (`inset 0 0 0 1px`).

### Availability Strip — the one motion moment
A 14-cell, 16px-tall strip; each day a hairline-bordered cell, open days filled graphic brass
(bookable-state data — a Brass Ledger slot). Exposed as `role="img"` with an "N of next 14 days
open" label; a date absent from the data renders closed (M-2: absence is closed).

On row hover the strip repaints for the inverted field — open cells brighten to Brass Bright —
painting **left-to-right with an 18ms per-cell stagger** (transition 0.22s
`cubic-bezier(0.16, 1, 0.3, 1)`), like results going up on the board. The global
`prefers-reduced-motion` rule kills it.

**The One Motion Rule.** This stagger is the system's only authored motion. Everything else is
instant or a plain ≤0.22s property transition. No entrance animations, no scroll effects, no
parallax — do not add any.

### Filters Bar
White plate with strong hairline border, 2px navy bottom edge, and the sanctioned grounding
shadow. **Exactly four filters** — role, home port, availability date, verified-only — the
contracted set; no additions. Labels are Oswald 500 at 11px/0.12em uppercase (the one display-face
label in the system); inputs sit on Board Ground with strong hairlines; the checkbox accent is
Brass Text; submit is a ghost-ink button. Server-rendered GET form — shareable URLs, zero client JS.

### Banner
Navy field opening the directory: Display Banner title ("THE CREW <em>BOARD</em>") bottom-aligned
against a Navy Muted meta paragraph (max 44ch) whose emphasis is white 600 weight, never brass.
No counts-as-ranks, no eyebrows.

### Profile & Account Panels
White plates (2px radius) on the board ground; the profile head adds a strong border and 2px navy
bottom edge, upgrading to brass-engrave edging when verified. Fact grids pair 10px mono uppercase
`dt` labels with 16px values. The booking panel is dashed (provisional). The in-page D-2
disclaimer sits in its own navy-edged plate so it reads as intentional beside the footer's copy —
both placements stay.

### Auth (Sign-up / Sign-in)
Centered 480px white panel. Fields: mono uppercase 11px labels over White Crisp inputs with
hairline borders. The role fork is two radio "plates" (Oswald 18px names) that edge in
brass-engrave when active, brass on hover. The D-2 disclaimer rides a bordered consent row with a
brass checkbox. Errors are brass-engrave-bordered plates with a mono Brass Text label — never red.

### BookingStateBadge
Mono uppercase 11px hairline badge, plate radius. Escrow/paid states edge and color in brass;
CANCELLED_WEATHER renders in Navy Panel as information, never error-red drama. User-facing labels
say **"Funds held"** — the word "escrow" never appears in user-facing text (its characterization
is attorney territory, G-1).

### Footer
Navy field, brass-engrave top hairline, carrying the verbatim D-2 disclaimer (13px, 72ch max, in
Mist) and the mono legal line on every page.

### Empty State
Dashed hairline plate, plain-spoken copy, a single Brass Text link out. The board count line
("N of M listed") is 10px mono uppercase census furniture.

## Do's and Don'ts

### Do:
- **Do** run `pnpm compliance:check` after any copy change; M-1 marketplace vocabulary (crew
  "offer services" / boats "book") is binding and CI-enforced.
- **Do** keep the D-2 disclaimer verbatim at all four placements: persistent footer, signup,
  every profile, booking flow.
- **Do** hold brass to the four ledger meanings (verification, primary action, open-day fill,
  display accent) and always use text-grade #8a6a1e for small text on white.
- **Do** keep counts as census ("25 of 25 listed") and order as the visitor's filter — never a
  score, position, or rank (M-2/P-4).
- **Do** keep the whole board row as one hit area with the navy inversion hover and the −3px
  brass `focus-within` outline; keep focus-visible rings everywhere (brass on white, Brass Bright
  on navy).
- **Do** keep the availability-strip stagger as the only motion and keep it dead under
  `prefers-reduced-motion`.
- **Do** label all demo data as synthetic.

### Don't:
- **Don't** use employment-implying language; the M-1 lint enumerates the banned vocabulary and
  fails the build.
- **Don't** add ordinals, rank numbers, medals, "top" badges, or any sequential registry
  furniture — the board lists, it never ranks.
- **Don't** introduce new eyebrows or kickers. The old world's Eyebrow Rule is retired and the
  directory/trail eyebrows were deleted; the hero coordinates line is the single sanctioned
  survivor until that surface is redesigned.
- **Don't** add entrance, scroll, or hover motion beyond the availability-strip stagger.
- **Don't** introduce new hues, gradients, pill radii, or shadows beyond the two sanctioned ones.
- **Don't** write "escrow" in user-facing text — it is "funds held" / "payment held".
- **Don't** exceed five chunks on a board row or four filters on the directory.
- **Don't** render a verification seal from self-reported data (V-1 admin-set only), and don't
  let any surface imply the platform guarantees competence — it verifies documents.
