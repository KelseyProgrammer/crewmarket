# DESIGN.md — Crew Market visual system

**Brief:** regal, seafaring, structured utility. Coastal palette: navy blue, crisp white, brass.
**Method:** Perception-First Design (PFD v0.7, Mode 2 derivation) constrained by the Intent system's
anti-pattern catalog and content discipline — and by this repo's compliance rules (M-1 language, D-2
disclaimer placement, V-1/V-4 credential visibility).

---

## 1. PFD derivation (Mode 2, bottom-up)

**Design problem.** A boat owner with a trip tomorrow must find a credentialed stranger and hand over
money before dawn; a crew member on a dock decides in seconds whether a listing is worth their day.
Both decisions are trust decisions made under time pressure, mediated entirely by how the interface
*feels* before either party reads a word.

**R1 — Cognitive load (L0).** Working memory holds 3–5 chunks (Cowan 2010); unattended visual noise
still bills against it (Hassin 2009). The directory MUST cap each card at five scannable chunks
(name+role, port, rate, verified state, availability) and cap filters at the four the SOW names —
role, port, date, verified-only. Nothing decorative competes on the white field.
**Citations:** Cowan (2010) for 3–5 chunk WM capacity; Hassin et al. (2009) for unconscious load.

**R2 — First impression (L1).** Appeal judgments form in ~50ms (Lindgaard 2006) and gate everything
downstream; aesthetic quality is read as functional quality (Kurosu & Kashimura 1995). A platform
holding escrowed money MUST land as *institutional* in the first glance — the visual register of a
yacht-club registry or an engraved chart, not a gig-app. Deep navy field, engraved-serif display,
brass used like metal hardware: sparingly, where it means something.
**Citations:** Lindgaard et al. (2006) for the 50ms gate; Kurosu & Kashimura (1995) for aesthetic-usability.

**R3 — Processing fluency (L2).** Fluency is read as truth (Reber & Schwarz 1999; Alter &
Oppenheimer 2009), and every element must tell the same story cross-modally (Spence 2011). The system
MUST hold to 2 type families + 1 utility face, 3 hues + neutrals, one 4px spacing grid, and one voice
(maritime-professional, per M-1: crew *offer services*, boats *book* — never hire/employ). Brass may
never appear as a large fill; it is an accent metal or the fluency story breaks.
**Citations:** Reber & Schwarz (1999) for fluency-as-truth; Spence (2011) for cross-modal coherence.

**R4 — Perception bias (L3).** Trust is a perceptual output, not an argument output (Seckler 2015);
users decide on autopilot and rationalize after (Kahneman 2011). Verification — the platform's core
trust asset (V-1) — MUST be *seen*, not read: a brass seal that self-reported profiles visibly lack,
and captain license class + expiry legible at a glance (V-4). Escrow protection is *shown* in the
booking trail, not asserted in adjectives.
**Citations:** Seckler et al. (2015) for trust as visual coherence; Kahneman (2011) for System-1 default.

**R5 — Decision architecture (L4).** The right choice must be the structurally easiest one, with
concrete language at near-term actions (Trope & Liberman 2010) and demonstration over description
(Hertwig & Erev 2009). Landing MUST fork immediately into the two real intents (crew list / boat
book) with concrete verbs; the directory MUST resolve each card into one action. No dark patterns —
per Intent's anti-pattern catalog and compliance P-4, off-platform behavior is outcompeted, never
policed, so no fake urgency, no punitive copy, no hidden fees (P-3: fee itemized).
**Citations:** Trope & Liberman (2010) for construal-matched CTAs; Hertwig & Erev (2009) for
decisions-from-experience.

**Solution shape satisfying R1–R5:** an *engraved registry* aesthetic — navy chart-field hero with
coordinate-line texture (quiet, sub-attentional), white "paper" directory where each crew listing is
a registry plate, and brass reserved for exactly two meanings: **verification** and **the primary
action**. Structure encodes information (rules, eyebrows, and plate numbers are chart furniture, not
decoration).

## 2. Tokens

| Token | Value | Role |
|---|---|---|
| `--navy-deep` | `#0A1D30` | Field: hero, footer, headers |
| `--navy-panel` | `#12314E` | Raised navy panels, hover states |
| `--white-crisp` | `#F8FAFB` | Paper field: directory, cards |
| `--brass` | `#A9822F` | Graphic brass: seal ring, borders, focus rings on white (non-text ≥3:1) |
| `--brass-text` | `#8A6A1E` | Text-grade brass on white (5.05:1, AA): eyebrows, brass links, button fill |
| `--brass-bright` | `#D7B36A` | Brass highlight/engrave edge, focus rings on navy |
| `--mist` | `#8FA6BA` | Secondary text on navy, hairlines |

Type — **Libre Caslon Display** (regal engraved display, headlines only) · **Archivo**
(structured-utility body/UI) · **IBM Plex Mono** (chart furniture: eyebrows, coordinates, rates,
plate numbers). Spacing on a 4px grid; radius 2px (plate-like, not pill-like); shadows minimal —
edges and rules do the work.

**Signature element:** the **brass verification seal** — an engraved circular seal on verified
plates, echoed by the coordinate eyebrow (`24.9° N · SOUTH FLORIDA FISHERY`). One bold move; all
else disciplined.

## 3. Intent notes (content + ethics)

- Voice: calm, exact, maritime-professional. Active verbs on controls ("Browse the directory",
  "List my services"). Labels label; nothing does double duty.
- M-1 is a *content rule* here, CI-enforced: `pnpm compliance:check` scans copy for employment-implying language.
- D-2 disclaimer is verbatim and persistent (footer of every page) — set quietly in mist-on-navy,
  present without shouting: legal presence, not anxiety furniture.
- Anti-pattern audit (Intent catalog): no urgency timers, no confirm-shaming, no pre-checked boxes,
  no ranking-for-pay over safety credentials (BUSINESS_MODEL back-pocket note retained).
