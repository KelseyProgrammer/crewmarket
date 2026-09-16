#!/usr/bin/env node
/**
 * e2e-booking-drive.mjs — G-3 e2e QA drive (Stripe TEST MODE, local stack only).
 * Repeatable evidence for docs/QA-G3.md. Pause-for-pay: Stripe has no API to
 * complete a hosted Checkout session and the webhook's paid-status guard is the
 * thing under test, so the script prints the Checkout URL and waits for a human
 * to pay with a test card, then polls the DB until the webhook lands.
 *
 * Prereqs: colima+compose up, `stripe listen --forward-to localhost:3002/...`,
 * `PORT=3002 pnpm dev` in apps/web. Then:
 *   node --env-file=.env.local scripts/e2e-booking-drive.mjs [--setup-only]
 * All data synthetic (repo rule); e2e-* accounts/bookings only are touched.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");
const requirePayments = createRequire(new URL("../packages/payments/package.json", import.meta.url));
const Stripe = requirePayments("stripe");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3002";
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const seed = JSON.parse(readFileSync(new URL("../apps/web/data/seed-crew.json", import.meta.url)));

const BOAT = { email: "e2e-boat@example.com", password: "e2e-boat-pass-1", name: "E2E Boat (synthetic)" };
const CREW = { email: "e2e-crew@example.com", password: "e2e-crew-pass-1", name: "E2E Crew (synthetic)" };
const STRANGER = { email: "e2e-stranger@example.com", password: "e2e-stranger-pass-1", name: "E2E Stranger (synthetic)" };

// ---------- assertion collector ----------
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------- fixtures ----------
async function ensureUser(u, accountType) {
  const existing = await prisma.user.findUnique({ where: { email: u.email } });
  if (existing) return existing;
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ ...u, accountType, disclaimerAccepted: true }),
  });
  if (!res.ok) throw new Error(`sign-up ${u.email}: ${res.status} ${await res.text()}`);
  return prisma.user.findUnique({ where: { email: u.email } });
}

async function signIn(u) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: u.email, password: u.password }),
  });
  if (!res.ok) throw new Error(`sign-in ${u.email}: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`sign-in ${u.email}: no set-cookie`);
  return {
    get: (path) => fetch(`${BASE}${path}`, { headers: { cookie } }),
    post: (path, body) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: BASE },
        body: JSON.stringify(body ?? {}),
      }),
  };
}

// ---------- booking factory (creation is web-only UI, not a Stripe flow) ----------
function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

async function createBooking(ctx, state = "REQUESTED", extra = {}) {
  return prisma.booking.create({
    data: {
      crewProfileId: ctx.profile.id,
      boatUserId: ctx.boat.id,
      tripType: "FULL_DAY",
      dates: [isoDay(7)],
      rateCents: ctx.rate,
      feeCents: ctx.fee,
      state,
      piAttestedAt: new Date(),
      ...extra,
    },
  });
}

// ---------- pause + poll helpers ----------
async function pollBooking(id, pred, label, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const b = await prisma.booking.findUnique({ where: { id } });
    if (pred(b)) return b;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timeout waiting for ${label} — is \`stripe listen\` running with the right whsec_?`);
}

// No stdin: the harness/CI shells that run this script have no interactive tty,
// so human steps are announced and then POLLED for (webhook/DB is the signal).
const PAY_TIMEOUT_MS = 10 * 60_000;
const ONBOARD_TIMEOUT_MS = 15 * 60_000;

function announcePay(url, card) {
  console.log(`\n>>> PAY NOW (test card ${card}, any expiry/CVC/ZIP):\n>>> ${url}`);
  console.log(">>> waiting for the webhook (up to 10 min)…\n");
}

async function transfersActive(accountId) {
  const acct = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });
  return acct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
}

// Waits for a TRANSFER-READY account, not just an account id: the id exists the
// moment "Set up payouts" is clicked, but transfers stay `restricted` until
// Express onboarding is finished through the final ToS accept (found the hard
// way — payout release 500s on a restricted account).
async function ensureConnectedAccount(ctx) {
  const claim = await prisma.crewProfileClaim.findUnique({ where: { profileId: ctx.profile.id } });
  if (claim?.stripeAccountId && (await transfersActive(claim.stripeAccountId))) {
    return claim.stripeAccountId;
  }
  console.log(`\n>>> ONE-TIME SETUP: sign in at ${BASE}/account as ${CREW.email} / ${CREW.password}`);
  console.log(">>> click 'Set up payouts' and complete Express onboarding to the FINAL");
  console.log(">>> 'Agree & submit' screen (any name/DOB, SSN 000000000, phone 0000000000,");
  console.log(">>> Stripe's test bank). Re-clicking the button resumes a partial onboarding.");
  console.log(">>> waiting for the transfers capability to go active (up to 15 min)…\n");
  const start = Date.now();
  while (Date.now() - start < ONBOARD_TIMEOUT_MS) {
    const after = await prisma.crewProfileClaim.findUnique({ where: { profileId: ctx.profile.id } });
    if (after?.stripeAccountId && (await transfersActive(after.stripeAccountId))) {
      return after.stripeAccountId;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("timeout: transfers capability never went active — was onboarding submitted?");
}

// ---------- Flow A: happy path through payout ----------
async function flowHappyPath(ctx, clients) {
  const { asBoat, asCrew } = clients;
  await ensureConnectedAccount(ctx);
  const b = await createBooking(ctx);

  let r = await asCrew.post(`/api/bookings/${b.id}/event`, { event: "CREW_ACCEPT" });
  check("A: crew accept -> ACCEPTED", r.status === 200 && (await r.json()).state === "ACCEPTED");

  r = await asBoat.post(`/api/bookings/${b.id}/checkout`, {});
  const { url } = await r.json();
  check("A: checkout returns url", r.status === 200 && !!url);
  announcePay(url, "4000 0000 0000 0077");

  const funded = await pollBooking(b.id, (x) => x.state === "ESCROW_FUNDED", "webhook funds-held", PAY_TIMEOUT_MS);
  check("A: webhook flipped to funds-held", funded.state === "ESCROW_FUNDED");
  check("A: paymentIntent recorded", !!funded.stripePaymentIntentId);
  const pi = await stripe.paymentIntents.retrieve(funded.stripePaymentIntentId);
  check("A: charged amount == totalCents", pi.amount === ctx.total, `${pi.amount} vs ${ctx.total}`);

  r = await asCrew.post(`/api/bookings/${b.id}/event`, { event: "TRIP_START" });
  check("A: trip start -> IN_PROGRESS", r.status === 200 && (await r.json()).state === "IN_PROGRESS");
  r = await asCrew.post(`/api/bookings/${b.id}/event`, { event: "TRIP_COMPLETE" });
  check("A: trip complete", r.status === 200);

  // window NOT elapsed: a read must not pay out
  r = await asBoat.get(`/api/bookings/${b.id}`);
  const early = await prisma.booking.findUnique({ where: { id: b.id } });
  check("A: no payout inside 48h window", early.stripeTransferId === null, `state ${early.state}`);

  await prisma.booking.update({ where: { id: b.id }, data: { completedAt: new Date(Date.now() - 49 * 3600_000) } });
  // Payout release is LAZY-ON-READ (withElapsedWindow) — each poll iteration
  // must re-GET the ledger route, or nothing ever retries the release.
  const paid = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      await asBoat.get(`/api/bookings/${b.id}`); // withElapsedWindow releases here
      const x = await prisma.booking.findUnique({ where: { id: b.id } });
      if (x.state === "PAID_OUT" && x.stripeTransferId) return x;
      await new Promise((res) => setTimeout(res, 3000));
    }
    throw new Error("timeout waiting for payout release — transfers capability active?");
  })();
  check("A: PAID_OUT after window elapse", paid.state === "PAID_OUT");
  const transfer = await stripe.transfers.retrieve(paid.stripeTransferId);
  check("A: transfer is exactly rateCents (fee retained)", transfer.amount === ctx.rate, `${transfer.amount} vs ${ctx.rate}`);

  // idempotency: a second read must not create a second transfer
  await asBoat.get(`/api/bookings/${b.id}`);
  const again = await prisma.booking.findUnique({ where: { id: b.id } });
  check("A: second read does not double-pay", again.stripeTransferId === paid.stripeTransferId);
}

// ---------- Flow B: refund path ----------
async function flowRefund(ctx, clients) {
  const { asBoat, asCrew } = clients;
  const b = await createBooking(ctx);
  await asCrew.post(`/api/bookings/${b.id}/event`, { event: "CREW_ACCEPT" });
  const r = await asBoat.post(`/api/bookings/${b.id}/checkout`, {});
  const { url } = await r.json();
  announcePay(url, "4242 4242 4242 4242");
  await pollBooking(b.id, (x) => x.state === "ESCROW_FUNDED", "webhook funds-held (B)", PAY_TIMEOUT_MS);

  const rc = await asBoat.post(`/api/bookings/${b.id}/event`, { event: "CANCEL_WEATHER" });
  check("B: weather cancel accepted", rc.status === 200);
  const cancelled = await pollBooking(b.id, (x) => x.stripeRefundId, "refund recorded");
  check("B: terminal weather state", cancelled.state === "CANCELLED_WEATHER", cancelled.state);
  const refund = await stripe.refunds.retrieve(cancelled.stripeRefundId);
  check("B: full refund (tier 1.0) == totalCents", refund.amount === ctx.total,
    `${refund.amount} vs ${ctx.total}`);

  // refund permanently blocks payout even after the window would elapse
  await prisma.booking.update({ where: { id: b.id }, data: { completedAt: new Date(Date.now() - 49 * 3600_000) } });
  await asBoat.get(`/api/bookings/${b.id}`);
  const after = await prisma.booking.findUnique({ where: { id: b.id } });
  check("B: refund blocks payout", after.stripeTransferId === null);
}

// ---------- Flow C: guards (no payment) ----------
async function flowGuards(ctx, clients) {
  const { asBoat, asCrew, asStranger } = clients;
  const b = await createBooking(ctx); // REQUESTED

  let r = await asCrew.post(`/api/bookings/${b.id}/event`, { event: "CANCEL_BOAT" });
  check("guard: crew cannot send CANCEL_BOAT", r.status === 403, `status ${r.status}`);
  r = await asBoat.post(`/api/bookings/${b.id}/event`, { event: "CREW_ACCEPT" });
  check("guard: boat cannot send CREW_ACCEPT", r.status === 403, `status ${r.status}`);
  r = await asStranger.get(`/api/bookings/${b.id}`);
  check("guard: non-party GET is 404", r.status === 404, `status ${r.status}`);
  r = await asStranger.post(`/api/bookings/${b.id}/event`, { event: "CANCEL_BOAT" });
  check("guard: non-party event rejected", r.status === 403 || r.status === 404, `status ${r.status}`);
  r = await asBoat.post(`/api/bookings/${b.id}/checkout`, {});
  check("guard: checkout rejected unless ACCEPTED", r.status === 409, `status ${r.status}`);

  // terminal stickiness (CAS): no event moves a cancelled booking
  const dead = await createBooking(ctx, "CANCELLED_BOAT", { closedAt: new Date() });
  r = await asCrew.post(`/api/bookings/${dead.id}/event`, { event: "CREW_ACCEPT" });
  check("guard: terminal state is sticky", r.status >= 400, `status ${r.status}`);
}

async function main() {
  const boat = await ensureUser(BOAT, "BOAT");
  const crew = await ensureUser(CREW, "CREW");
  await ensureUser(STRANGER, "BOAT");

  // e2e crew claims a fixed seed profile that mate@example.com does NOT use
  // (demo uses the first MATE). V-2: refuse a profile that has credential docs.
  const demoProfile = seed.profiles.find((p) => p.roles.includes("MATE"));
  const profile = seed.profiles.find(
    (p) => p.id !== demoProfile.id && p.roles.includes("DECKHAND"),
  );
  const docs = await prisma.credentialDoc.count({ where: { profileId: profile.id } });
  if (docs > 0) throw new Error(`profile ${profile.id} has credential docs — pick another (V-2)`);
  const existingClaim = await prisma.crewProfileClaim.findUnique({ where: { profileId: profile.id } });
  if (existingClaim && existingClaim.userId !== crew.id)
    throw new Error(`profile ${profile.id} claimed by someone else — refusing to reassign (V-2)`);
  if (!existingClaim)
    await prisma.crewProfileClaim.create({ data: { userId: crew.id, profileId: profile.id } });

  // deterministic runs: remove only THIS drive's prior bookings
  await prisma.booking.deleteMany({ where: { boatUserId: boat.id } });

  const rate = Math.round(profile.dayRateUsd * 100);
  const fee = Math.round(rate * 0.12);
  const ctx = { boat, crew, profile, rate, fee, total: rate + fee };
  console.log(`fixtures ready: ${profile.displayName} (${profile.id}), rate ${rate}c fee ${fee}c`);
  if (process.argv.includes("--setup-only")) return ctx;

  const clients = {
    asBoat: await signIn(BOAT),
    asCrew: await signIn(CREW),
    asStranger: await signIn(STRANGER),
  };

  // one flow's throw must not abort the others — each gets its own booking(s)
  for (const [name, fn] of [
    ["guards", flowGuards],
    ["happy-path", flowHappyPath],
    ["refund", flowRefund],
  ]) {
    try {
      await fn(ctx, clients);
    } catch (err) {
      check(`${name}: flow completed`, false, String(err?.message ?? err));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== G-3 e2e drive: ${results.length - failed.length}/${results.length} PASS ====`);
  for (const f of failed) console.log(`FAIL  ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exitCode = failed.length ? 1 : 0;
  return ctx;
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
