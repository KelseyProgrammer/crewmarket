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

### 2026-08-28 — Crew Market web app (landing, directory, sign-up, sign-in, account) — Mode 1 corpus-backed audit
**Type:** html
**Domain:** Two-sided marketplace MVP (sportfishing crew directory + booking), pre-launch, synthetic data
**Key finding:** A signature accent chosen for meaning (brass = verification + primary action) failed AA contrast (3.55:1) in every small-text role it was given — the semantic discipline that made the palette strong concentrated all legibility risk into one token, invisible until measured. Secondary: compliance-driven honesty (no fabricated social proof, "self-reported" markers) reads as an L3 strength, not a gap, when mechanisms are shown instead.
**Layer(s):** L2 (primary), L4 (dead-end registry plates pre-booking-phase), L3 (pre-launch social-proof absence as intentional deviation)
**Promote?:** maybe
**Notes:** Pattern: single-token accent systems should carry a paired *text-grade* variant from day one (--accent vs --accent-text); the evaluation could not have caught this from taste alone — only computed ratios surfaced it. Also: phase-honest scoring — L4 dead ends that are known unbuilt phases still cost the visitor, score them but classify the intent.
