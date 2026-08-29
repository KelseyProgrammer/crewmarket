# PFD Insights Log

Running log of non-obvious findings from every PFD analysis.
Reviewed periodically. Candidates get promoted to `accumulated-learnings.md`;
the rest stay as searchable history.

**Format:**
```markdown
### YYYY-MM-DD: [Brief description of what was analyzed]
**Type:** url | text | image | html | css | copy | directory
**Domain:** [e.g., SaaS landing, ecommerce PDP, email, portfolio, dashboard, presentation]
**Key finding:** [The non-obvious thing PFD surfaced, one sentence]
**Layer(s):** [Which PFD layer(s) this relates to: Foundation/L1/L2/L3/L4]
**Promote?:** yes | maybe | no
**Notes:** [Optional: context, cross-references to prior findings, patterns noticed]
```

---

<!-- New entries go here, newest first -->

### 2026-08-28 — Crew Market re-evaluation after top-3 fix application (same session)
**Type:** html
**Domain:** Two-sided marketplace MVP, pre-launch — delta audit vs. same-day baseline (76/100)
**Key finding:** Three surgical fixes (one token split, one route, two lines of copy) moved the overall 76→81 without touching the visual world — confirming the baseline diagnosis that the failures were mechanical (contrast math, a missing route) rather than aesthetic. The intentional social-proof absence is now the stable ceiling: no further design work can raise L3 until real bookings generate real evidence.
**Layer(s):** L2 (74→82, major resolved), L4 (66→76, dead ends resolved), L0/L3 minor
**Promote?:** no
**Notes:** Delta audits are cheap when the baseline evidence pipeline (fetch + computed metrics) is scripted; only changed pairs needed re-measurement. Cross-ref the 2026-08-28 baseline entry.

### 2026-08-28 — Crew Market web app (landing, directory, sign-up, sign-in, account) — Mode 1 corpus-backed audit
**Type:** html
**Domain:** Two-sided marketplace MVP (sportfishing crew directory + booking), pre-launch, synthetic data
**Key finding:** A signature accent chosen for meaning (brass = verification + primary action) failed AA contrast (3.55:1) in every small-text role it was given — the semantic discipline that made the palette strong concentrated all legibility risk into one token, invisible until measured. Secondary: compliance-driven honesty (no fabricated social proof, "self-reported" markers) reads as an L3 strength, not a gap, when mechanisms are shown instead.
**Layer(s):** L2 (primary), L4 (dead-end registry plates pre-booking-phase), L3 (pre-launch social-proof absence as intentional deviation)
**Promote?:** maybe
**Notes:** Pattern: single-token accent systems should carry a paired *text-grade* variant from day one (--accent vs --accent-text); the evaluation could not have caught this from taste alone — only computed ratios surfaced it. Also: phase-honest scoring — L4 dead ends that are known unbuilt phases still cost the visitor, score them but classify the intent.

### 2026-08-29 — Directory re-execution probes (three directions, navy/white/brass pinned)
**Type:** html
**Domain:** Marketplace directory (sportfishing crew)
**Key finding:** The incumbent "Engraved Registry" is itself the rut's opposite pole — the governing metaphor's literal reading (registry → antique document). User-reported "stuffy/flat/generic" traces to L1: the world was derived from the product's metaphor, not the audience's lived visual world (helm electronics, dock tags, tournament boards).
**Layer(s):** L1, L2
**Promote?:** maybe
**Notes:** Probes at artifact caf986f4; seed key cc54bbda (impeccable concept-seed). Labanotation challenger donated duration-as-length availability encoding — a decorative-free way to add expression on an information channel (satisfies L0 constraint R1).
