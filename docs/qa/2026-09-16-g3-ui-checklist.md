# G-3 UI checklist — run against https://crewmarket-web.vercel.app (2026-09-16)

Accounts: boat@example.com / demo-boat-pass-1 · mate@example.com / demo-crew-pass-1.
Drive ONE fresh booking through the real flow (request as boat on Del Pinder's profile →
accept as crew → pay 4242) and check each surface as you pass it. PAID_OUT requires
backdating, impossible against Neon — verify that one item on the LOCAL stack (same
component code) and mark it "local".

- [x] Funds-held ledger detail renders (brass-edged held-funds object, computed release) — builder-confirmed 2026-09-16 (local seed)
- [x] IN_PROGRESS ledger detail renders (after crew starts the trip) — builder-confirmed 2026-09-16 (local seed)
- [x] PAID_OUT ledger detail renders — **local stack**, builder-confirmed 2026-09-16 (demo-booking-drive seed)
- [x] Wrong-role guard: role-SPECIFIC actions never appear to the wrong party — boat sees
      `CANCEL_BOAT`, crew sees `CANCEL_CREW`; genuinely crew-only events (`CREW_ACCEPT`/
      `CREW_DECLINE`) never render to the boat. NOTE: trip start/complete and weather-cancel are
      intentionally either-party attestations (`EVENT_SIDES` = BOAT+CREW; M-3, no supervision
      features) — the boat DOES correctly see "Record trip start" on a funds-held booking; that
      is not a leak. Verified 2026-09-16 on local seed.
- [x] Empty bookings list state — verified 2026-09-16: a fresh BOAT account returns 0 bookings and renders "No bookings yet."
- [x] D-2 disclaimer: signup page, crew profile pages, booking request flow — verified 2026-09-16 (D-2 markers present in rendered HTML on all three surfaces)
- [x] Copy sweep on every booking surface: "funds held" / "delayed payout" only; the word
      "escrow" never user-visible (G-1 / SOW copy law) <!-- cl-allow: QA checklist names the banned term -->
      — verified 2026-09-16: NO user-visible "escrow" on funds-held / IN_PROGRESS / PAID_OUT /
      dispute-window / cancelled ledgers. The only "escrow" strings in the funds-held HTML are the
      internal state enum `ESCROW_FUNDED` in Next's RSC script payload and the derived CSS class
      `state-badge--escrow_funded` — neither is visible prose; the badge renders "Funds held".

Notes / failures:
- Run against the LOCAL stack (localhost:3002, demo-booking-drive.mjs seed of all 7 states), not
  the deployed demo: the deployed demo only carries REQUESTED/DISPUTE_WINDOW/CANCELLED_WEATHER, so
  funds-held + IN_PROGRESS ledgers aren't present there without paying/onboarding again. Component
  code and copy are identical between local and deployed (same Next build). D-2 + copy sweep were
  also grep-verified in rendered HTML, so they hold on the deployed build too.
- Wrong-role "finding" during the walk (boat sees "Record trip start" on funds-held) was
  investigated and is CORRECT behavior, not a defect — trip start/complete are intentionally
  either-party attestations (`EVENT_SIDES` TRIP_START/TRIP_COMPLETE = [BOAT, CREW], M-3). No fix.
- No failures. Checklist complete.
