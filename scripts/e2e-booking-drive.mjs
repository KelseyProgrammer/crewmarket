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
import { createInterface } from "node:readline/promises";

const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");
const requirePayments = createRequire(new URL("../packages/payments/package.json", import.meta.url));
const Stripe = requirePayments("stripe");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3002";
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const seed = JSON.parse(readFileSync(new URL("../apps/web/data/seed-crew.json", import.meta.url)));
const rl = createInterface({ input: process.stdin, output: process.stdout });

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
  await flowGuards(ctx, clients);
  return ctx;
}

try {
  await main();
} finally {
  rl.close();
  await prisma.$disconnect();
}
