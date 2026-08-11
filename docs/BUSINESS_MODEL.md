# BUSINESS_MODEL.md — decision record (status: recommended, not final)

## Recommendation for v1
- Free crew listings (always — supply side must be frictionless in a small industry).
- Free boat browsing + job posts.
- **12% take rate on booked jobs**, itemized (e.g. boat pays rate + fee, or fee split — model both in Stripe test mode and pick one).
- Escrow via Stripe Connect: fund at booking, payout after trip + 48h dispute window.

## The leakage problem (be honest with the client)
Sportfishing hiring is relationship-driven and repeat-heavy. Expect first-booking-then-direct behavior.
Counter with value, not policing (COMPLIANCE.md P-4): escrow protection, cancellation cover
(weather matters enormously here), verified credentials, and reviews that only accrue on-platform.

## Back-pocket revenue (post-validation)
- Boat subscription: priority access to top crew in tournament season, saved crew lists, multi-boat programs.
- Featured crew placement during peak season (careful: never pay-to-rank over safety credentials).
- Verified-COI insurance tier (D-4 upgrade).

## Open questions for the client
1. Launch region — single fishery first (e.g. South Florida) beats national. Density wins in marketplaces.
2. Fee side: boat-pays, crew-pays, or split? (Recommend boat-pays-most; protect crew take-home.)
3. Tournament season dynamics: surge demand, multi-day bookings, team continuity — v1 or v2?
