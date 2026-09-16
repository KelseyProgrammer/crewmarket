# Two decisions we need from you — Crew Market

*Draft note for the client · 2026-09-16*

---

## Short text-message version

> Hey — bookings + payments are built and tested, credentials piece is live. Two things
> I need a call from you on before we wire them up:
>
> 1. **Disputes.** Right now a boat's payment auto-releases to the crew 48h after a trip
> is marked done. There's no "raise a dispute" button to pause that yet. How should it
> work — who can raise one, how long they get, does the money stay held till it's sorted,
> and who decides? This one's really a Terms-of-Service / lawyer question, so maybe run it
> by your attorney.
>
> 2. **Verified docs.** Crew can currently delete a license *after* an admin has verified
> it, which wipes the record that it was ever checked. Want me to (a) leave it, (b) hide it
> from their profile but keep it on file, or (c) keep a small record of what was verified?
>
> No rush — just send answers whenever and I'll build to match.

*(Full version below if you'd rather send that.)*

Hi — the booking and payments work is built and tested end to end in Stripe's test
mode, and the credential-verification piece is live. Two things are now waiting on a
decision that's yours to make (and, where noted, one for your attorney). We've built
everything right up to the decision point and stopped there on purpose — these aren't
calls we should make for you.

---

## 1. How disputes on a booking should work

**Where it stands today.** When a boat pays for a booking, the money is held and then
released to the crew member automatically **48 hours after the trip is marked complete**.
That 48-hour window is meant to be a chance to flag a problem before the money moves.

**The gap.** Right now there's no way for either side to formally *raise a dispute* that
pauses that automatic release. The window just counts down and pays out. So the "flag a
problem" step exists in spirit but has no button behind it yet.

**Why it's your call (and your attorney's).** How disputes work touches your Terms of
Service and the booking agreement between boats and crew — who can raise one, how long
they have, what happens to the held money while a dispute is open, and how it finally
gets resolved. That's legal and policy territory, so it should be decided by you with
your attorney, not by us.

**What we need to build it.** A short policy answering:
- **Who** can raise a dispute — the boat, the crew member, or either?
- **When** — only during the 48-hour window, or for some period after?
- **What happens to the held money** while a dispute is open — does it stay held until
  resolved?
- **Who resolves it, and how** — you/support review it manually? Some other process?

Once you give us those answers, we add the "raise a dispute" action and the hold logic
to match. Until then, the automatic 48-hour release is what's in place.

---

## 2. Whether crew can delete a credential document after it's been verified

**Where it stands today.** Crew upload their credential documents (licenses,
certifications). An admin reviews each one and marks it **verified**. At the moment, a
crew member can **delete a document even after it's been verified** — and when they do,
the record of what was reviewed goes with it. There's no history left showing that a
valid license was checked.

**Why it matters.** For trust and for your own protection, you may want to keep a record
that a document *was* verified — what it was and when it was reviewed — even if the crew
member later removes it from their profile. Or you may be fine letting crew fully remove
their own documents. It's a judgment call about record-keeping versus letting people
control their own data.

**Your options:**
- **(a) Leave it as-is** — crew can fully delete their documents, verified or not.
- **(b) Keep it on file but hide it** — deleting removes it from the crew member's
  profile, but the verified record stays on file for you.
- **(c) Keep an audit record** — even after deletion, retain a small record of what was
  verified and when (not the document itself).

This is a policy and privacy decision for you. Whatever you choose, we implement it — the
work is small either way.

---

**No rush on either**, but the dispute one in particular is worth starting with your
attorney whenever you next talk, since it's tied to the Terms of Service wording. Send us
your answers and we'll wire both up.
