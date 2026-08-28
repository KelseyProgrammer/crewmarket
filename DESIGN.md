---
name: Crew Market
description: Regal seafaring marketplace — engraved registry aesthetic in navy, crisp white, and brass
colors:
  navy-deep: "#0a1d30"
  navy-panel: "#12314e"
  white-crisp: "#f8fafb"
  brass: "#a9822f"
  brass-text: "#8a6a1e"
  brass-text-hover: "#7d5f1b"
  brass-bright: "#d7b36a"
  card-face: "#ffffff"
  mist: "#8fa6ba"
  ink: "#10222f"
  ink-soft: "#4a5c6b"
  line-on-white: "rgba(16, 34, 47, 0.14)"
  line-on-navy: "rgba(143, 166, 186, 0.28)"
  brass-engrave: "rgba(169, 130, 47, 0.45)"
typography:
  display:
    fontFamily: "Libre Caslon Display, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(34px, 5.4vw, 58px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "normal"
  title-page:
    fontFamily: "Libre Caslon Display, Iowan Old Style, Georgia, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.2
  headline:
    fontFamily: "Libre Caslon Display, Iowan Old Style, Georgia, serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Libre Caslon Display, Iowan Old Style, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.25
  title-minor:
    fontFamily: "Libre Caslon Display, Iowan Old Style, Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.3
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
    letterSpacing: "normal"
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
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.18em"
  label-micro:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "10px"
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
    backgroundColor: "#7d5f1b"
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
  plate-card:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "16px"
---

# Design System: Crew Market

## Overview

**Creative North Star: "The Engraved Registry"**

Crew Market's interface carries the visual register of a yacht-club vessel registry or an engraved
nautical chart: a deep navy field with sub-attentional latitude hairlines, a crisp white "paper"
surface where crew listings sit as registry plates, and brass used the way real brass is used on a
boat — as hardware, sparingly, where it means something. The system is regal without ornament and
utilitarian without coldness; structure (rules, mono eyebrows, plate numbers) is chart furniture
that encodes information, never decoration. A platform that holds escrowed money must *land* as
institutional in the first glance, and every screen is built to that bar.

This file records the incumbent system for on-brand generation. The **derivation rationale** —
the Perception-First Design requirement stack (R1–R5) with citations — lives in `docs/DESIGN.md`,
which is the source of truth for *why*; this file is the source of truth for *what*.

**Key Characteristics:**
- Navy field / white paper duality; brass as meaningful metal, never a wash
- Engraved serif display over structured grotesk body over mono chart furniture
- Registry-plate cards with a brass verification seal as the signature element
- Flat, edge-defined surfaces (2px radius, hairline rules, near-zero shadow)
- Compliance-bound copy: marketplace vocabulary only, D-2 disclaimer persistent

## Colors

Three hues plus disciplined neutrals; the palette *is* the coastal brief — navy, crisp white, brass.

### Primary
- **Navy Deep** (#0a1d30): The institutional field — hero, masthead, footer. Latitude hairlines
  (`line-on-navy` at reduced alpha ~0.1) texture it without registering consciously.
- **Brass** (#a9822f): The meaning-carrying metal, in exactly two roles: verification
  (seal, verified-plate edging via `brass-engrave`) and the primary action. It splits by duty:
  **graphic brass** (#a9822f) for the seal ring, borders, edging, and focus rings (non-text, ≥3:1),
  and **Brass Text** (#8a6a1e, 5.05:1 on white) for every text-sized use on white fields — eyebrows,
  seal label, brass links, badge text — and the primary-button fill (hover deepens to #7d5f1b).
  Same metal, two finishes; never use graphic brass for small text on white (it fails WCAG AA).

### Secondary
- **Brass Bright** (#d7b36a): Brass highlight on navy — wordmark accent, eyebrows on navy, focus
  rings on dark fields. Never a background.

### Neutral
- **White Crisp** (#f8fafb): Paper field for the directory and content surfaces; card faces are pure #ffffff.
- **Ink** (#10222f) / **Ink Soft** (#4a5c6b): Body and secondary text on white.
- **Mist** (#8fa6ba): Secondary text and hairlines on navy (footer legal, nav links at rest).
- **Line on White** (rgba(16,34,47,.14)) / **Brass Engrave** (rgba(169,130,47,.45)): Hairline borders.

### Named Rules
**The Brass Rule.** Brass carries exactly two meanings — verification and the primary action. If
brass appears anywhere else, it dilutes both. Never use brass as a fill for large areas, decorative
icons, or mood. Pick the finish by duty: graphic brass for drawn things, Brass Text for read things
(small text on white must always be the text-grade #8a6a1e).

**The Two-Field Rule.** Every screen is either navy field or white paper per section; the two never
blend, gradient, or overlap mid-section. Transitions happen at hard section boundaries.

## Typography

**Display Font:** Libre Caslon Display (with Iowan Old Style, Georgia, serif)
**Body Font:** Archivo (with system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, monospace)

**Character:** Engraved regal authority (Caslon, always weight 400 — its elegance is the point)
over structured utility (Archivo) with mono chart furniture doing the wayfinding. The pairing reads
naval-registry, not SaaS.

### Hierarchy
- **Display** (400, clamp(34px, 5.4vw, 58px), 1.08): Hero headline only; italic + Brass Bright for
  the single emphasized phrase; max-width 16ch, balanced wrap.
- **Headline** (400 display face, 28px, 1.2): Section headings ("Find crew for your next trip").
- **Title** (400 display face, 22px, 1.25): Plate names (crew display names).
- **Body** (400 Archivo, 16px, 1.55): Prose; hero subtitle at 17px in Mist on navy; measure 62ch.
- **Label** (400–500 IBM Plex Mono, 10–12px, 0.10–0.18em, UPPERCASE): Eyebrows, coordinates,
  registry numbers, fact labels (`dt`), state badges, footer legal.

### Named Rules
**The Eyebrow Rule.** Every major section opens with a mono uppercase eyebrow (brass on white,
brass-bright on navy) styled as chart furniture — a coordinate, a registry count, a phase label.
It is informational (real counts, real coordinates), never lorem decoration.

## Layout

Max content width 1080px (1240px wide variant) with 24px side padding, on a strict 4px spacing grid
(tokens s1–s9: 4/8/12/16/24/32/48/64/96). Directory cards auto-fill at minmax(300px, 1fr) with 24px
gaps. The hero runs generous vertical space (96px top) to let the navy field breathe; section
boundaries use hairlines, not spacing alone. Responsive: trail steps 4→2→1 columns at 760px/480px;
filters wrap naturally as a flex row. Density is calm-institutional, not dashboard-dense.

## Elevation & Depth

Effectively flat. Depth is drawn with edges — hairline borders, the inset brass edging on verified
plates (`box-shadow: inset 0 0 0 1px brass-engrave`), and field contrast between navy and white —
never with drop shadows or blur. The sticky mock/presentation bar and masthead separate by border,
not shadow. If a surface needs to feel raised on navy, use Navy Panel (#12314e), not elevation.

## Shapes

2px radius everywhere ("plate, not pill") — cards, buttons, inputs, badges. No circles except the
verification seal, whose circular engraved form is the deliberate exception that makes it read as a
seal. No skews, blobs, or organic shapes; the geometry is drafted, like chart linework.

## Components

- **Masthead**: Navy bar, Caslon wordmark ("Crew" white, "Market" brass-bright), mono uppercase nav
  links in Mist → brass-bright on hover; hairline brass-engrave bottom border.
- **Buttons**: `button-primary` (brass-text fill #8a6a1e, white text — AA) for the one primary
  action per screen;
  `button-ghost-navy` / `button-ghost-ink` hairline-bordered ghosts elsewhere; borders warm to
  brass on hover; 2px radius, 14×22px padding, 600-weight Archivo at 15px.
- **Registry Plate (CrewCard)**: White card, hairline border; verified plates upgrade the border to
  brass-engrave with matching inset line. Anatomy top-to-bottom: mono eyebrow (REG number · port),
  Caslon name, role line with license class + expiry (self-reported credentials say so, in italic
  ink-soft), 3-column fact grid (Day rate / Experience / Next open — mono values), fisheries line.
  Max five scannable chunks; nothing else may be added without removing something.
- **VerifiedSeal**: Engraved circular SVG (solid ring, dashed inner ring, check) in brass with mono
  "VERIFIED" label. Rendered **only** when an admin-set credential.verified is true (rule V-1).
- **Filters bar**: White panel, mono uppercase labels above inputs; inputs on white-crisp with
  hairline borders; brass accent-color checkbox; ghost-ink submit. Exactly four filters (role,
  port, availability date, verified-only) — the contracted set, no additions.
- **BookingStateBadge**: Mono uppercase hairline badge; escrow/paid states edge in brass;
  CANCELLED_WEATHER styled as information (navy), never as error-red drama.
- **Footer**: Navy field carrying the verbatim D-2 disclaimer in Mist plus mono legal line.
- **Empty state**: Dashed hairline panel, plain-spoken copy, single brass-colored text link out.

## Do's and Don'ts

**Do**
- Run `pnpm compliance:check` after any copy change; M-1 vocabulary (offer services / book) is binding.
- Keep the D-2 disclaimer verbatim and persistent; add it to signup, profiles, and booking flow as built.
- Give every new section a truthful mono eyebrow; keep brass scarce so the seal stays loud.
- Maintain focus-visible rings (brass on white, brass-bright on navy) and reduced-motion behavior.
- Label all demo data as synthetic.

**Don't**
- Don't use employment-implying language — the M-1 lint enumerates the banned vocabulary and CI fails the build on it.
- Don't add urgency timers, confirm-shaming, pre-checked boxes, or pay-to-outrank-safety placement.
- Don't introduce new hues, gradients, drop shadows, pill radii, or a second accent.
- Don't render a verification seal from self-reported data, and don't let any surface imply the
  platform guarantees competence (V-3 — it verifies documents).
- Don't exceed five chunks on a plate or four filters on the directory.
