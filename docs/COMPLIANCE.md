# COMPLIANCE.md — Crew Market

> Engineering policy, not legal advice. An attorney (employment + maritime) reviews before launch.

## 1. The identity rule: Marketplace, NOT an employer (rule prefix: M)

The single biggest legal risk in this product is **contractor misclassification**. Crew are independent contractors engaging directly with vessel owners/captains. The platform introduces, facilitates payment, and steps back.

- **M-1 Language discipline (CI-enforced via `classification-lint`):** never use "employee", "wages", "shifts we assign", "our crew", "hire through us". Crew "offer services"; boats "book" them. Copy review required for any hiring-adjacent string.
- **M-2 Crew autonomy is structural, not cosmetic:** crew set their own day rates (no platform-mandated pricing), accept/decline any job without penalty scoring, work for unlimited boats, set their own availability. Never build features that penalize declining work.
- **M-3 No supervision features:** no clock-in/out, no task checklists issued by the platform, no performance management. Reviews are peer-to-peer marketplace reviews, not employer evaluations.
- **M-4 The contract is between boat and crew.** Platform ToS facilitates; a per-booking agreement names the vessel owner and the crew member as the parties. Template provided, platform is not a party to the work.
- **M-5 Maritime wrinkle (attorney item):** injured seamen have remedies (Jones Act negligence claims, maintenance & cure) that run against the *employer/vessel*. The platform must never behave in ways that let a claim recast it as the employer. Disclaimers + M-1..M-4 are the engineering contribution; insurance requirements (below) are the practical one.

## 2. Credentials & verification (rule prefix: V)

- **V-1** Credential fields (USCG license #, class & expiry; CPR/First Aid; STCW; TWIC; state charter licenses where applicable) are structured, with expiry tracking and a `verified` flag set only by an admin/vendor check — self-reported ≠ verified, and the UI must visually distinguish them.
- **V-2** Uploaded credential documents are PII: private S3 bucket, encrypted at rest, presigned-URL access only, never in logs.
- **V-3** Verification honesty: the platform verifies documents exist and match names; it does not guarantee competence. Disclaimer D-2 sits on every profile.
- **V-4** Captains-for-hire (6-pack/OUPV, Master) get an explicit license-class badge — a boat owner booking a captain needs to see license class and expiry at a glance.

## 3. Payments & tax (rule prefix: P)

- **P-1** Stripe Connect **Express** accounts for all crew. Stripe handles KYC, payout rails, and 1099 generation/filing — the platform never stores SSNs or bank numbers.
- **P-2** Escrow flow: boat pays at booking (funds held), crew paid out after trip completion + a short dispute window (48h). Cancellation tiers defined in ToS (e.g., weather cancellations — common in this industry — refund differently than no-shows; attorney + product decision).
- **P-3** Platform fee is transparent and itemized on both sides. No hidden spread on crew payouts.
- **P-4** Off-platform payment isn't policed punitively (unenforceable and hostile in a small industry) — it's outcompeted: escrow protection, reviews, and cancellation cover only exist for on-platform bookings.

## 4. Data & privacy (rule prefix: D)

- **D-1** Standard PII care: TLS everywhere, encrypted-at-rest Postgres, no PII in logs, MFA for admins. (No PHI in scope — do not collect medical data; drug-test status, if ever requested by charter operators, is an attorney conversation first, not a schema field.)
- **D-2 Mandatory disclaimers:** "Crew Market is a directory and booking marketplace. We are not an employer, crewing agency, or vessel operator. Vessel owners are solely responsible for crew selection, vessel operation, and legal compliance including insurance." Placement: signup (checkbox), every profile, booking flow.
- **D-3** Location data (home port, current region) is coarse by default — never live GPS of crew members.
- **D-4** Insurance fields: boats attest to P&I coverage incl. crew liability at booking; stored as attestation with date. The platform requires the attestation, not proof (v1) — upgrading to verified COIs is a roadmap item.

## 5. Launch gates (rule prefix: G)

- **G-1** Attorney review: ToS, booking agreement template, classification posture, per-state charter rules.
- **G-2** `classification-lint` implemented and green in CI (M-1).
- **G-3** Stripe Connect flows tested end-to-end in test mode incl. refund and dispute paths.
