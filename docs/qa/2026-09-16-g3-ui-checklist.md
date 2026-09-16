# G-3 UI checklist — run against https://crewmarket-web.vercel.app (2026-09-16)

Accounts: boat@example.com / demo-boat-pass-1 · mate@example.com / demo-crew-pass-1.
Drive ONE fresh booking through the real flow (request as boat on Del Pinder's profile →
accept as crew → pay 4242) and check each surface as you pass it. PAID_OUT requires
backdating, impossible against Neon — verify that one item on the LOCAL stack (same
component code) and mark it "local".

- [ ] Funds-held ledger detail renders (brass-edged held-funds object, computed release) — never screenshot-verified
- [ ] IN_PROGRESS ledger detail renders (after crew starts the trip) — never screenshot-verified
- [ ] PAID_OUT ledger detail renders — **local stack** (backdate with scripts/dev-backdate-booking.mjs)
- [ ] Wrong-role guard: signed in as the OTHER party, the action slot shows no forbidden actions
- [ ] Empty bookings list state (a fresh account with no bookings)
- [ ] D-2 disclaimer: signup page, crew profile pages, booking request flow
- [ ] Copy sweep on every booking surface: "funds held" / "delayed payout" only; the word
      "escrow" never user-visible (G-1 / SOW copy law) <!-- cl-allow: QA checklist names the banned term -->

Notes / failures:
- (record here; any failure becomes a fix task before docs/QA-G3.md closes)
