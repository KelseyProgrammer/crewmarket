#!/usr/bin/env node
/**
 * demo-booking-drive.mjs — synthetic QA data for the booking flow (dev only).
 * Creates demo BOAT + CREW accounts (via the running app's Better Auth API),
 * claims a profile for the crew account, then seeds one booking per interesting
 * state so every ledger screen is drivable/screenshotable.
 *
 *   1. app running (e.g. `npx next start -p 3405` in apps/web)
 *   2. node --env-file=.env.local scripts/demo-booking-drive.mjs [baseUrl]
 *
 * All data synthetic (repo rule). Money math mirrors booking-pricing.ts
 * (12% fee constant) — display-only QA data, never a pricing source.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Resolve @prisma/client through packages/db (pnpm keeps it out of the root).
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");

const BASE = process.argv[2] ?? "http://localhost:3405";
const prisma = new PrismaClient();
const seed = JSON.parse(readFileSync(new URL("../apps/web/data/seed-crew.json", import.meta.url)));

const BOAT = { email: "boat@example.com", password: "demo-boat-pass-1", name: "Reel Weekend (demo boat)" };
const CREW = { email: "mate@example.com", password: "demo-crew-pass-1", name: "Demo Crew Account" };

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

const boat = await ensureUser(BOAT, "BOAT");
const crewUser = await ensureUser(CREW, "CREW");

const profile = seed.profiles.find((p) => p.roles.includes("MATE"));
await prisma.crewProfileClaim.deleteMany({ where: { OR: [{ userId: crewUser.id }, { profileId: profile.id }] } });
await prisma.crewProfileClaim.create({ data: { userId: crewUser.id, profileId: profile.id } });

const h = 3600_000;
const now = Date.now();
const day = (offset) => new Date(now + offset * 24 * h).toISOString().slice(0, 10);
const rate = Math.round(profile.dayRateUsd * 100);
const fee = Math.round(rate * 0.12);

await prisma.booking.deleteMany({ where: { boatUserId: boat.id } });

const rows = [
  { state: "REQUESTED", dates: [day(7)] },
  { state: "ACCEPTED", dates: [day(9)], acceptedAt: new Date(now - 2 * h) },
  { state: "ESCROW_FUNDED", dates: [day(11)], acceptedAt: new Date(now - 26 * h), fundsHeldAt: new Date(now - 24 * h) },
  { state: "IN_PROGRESS", dates: [day(0)], acceptedAt: new Date(now - 50 * h), fundsHeldAt: new Date(now - 48 * h), tripStartedAt: new Date(now - 5 * h) },
  { state: "DISPUTE_WINDOW", dates: [day(-1)], acceptedAt: new Date(now - 80 * h), fundsHeldAt: new Date(now - 78 * h), tripStartedAt: new Date(now - 30 * h), completedAt: new Date(now - 6 * h) },
  { state: "PAID_OUT", dates: [day(-5)], acceptedAt: new Date(now - 150 * h), fundsHeldAt: new Date(now - 148 * h), tripStartedAt: new Date(now - 120 * h), completedAt: new Date(now - 100 * h), closedAt: new Date(now - 52 * h) },
  { state: "CANCELLED_WEATHER", dates: [day(3)], acceptedAt: new Date(now - 30 * h), fundsHeldAt: new Date(now - 28 * h), closedAt: new Date(now - 4 * h) },
];

for (const r of rows) {
  const { state, dates, ...stamps } = r;
  const b = await prisma.booking.create({
    data: {
      crewProfileId: profile.id,
      boatUserId: boat.id,
      tripType: "FULL_DAY",
      dates,
      rateCents: rate,
      feeCents: fee,
      state,
      piAttestedAt: new Date(now - 3 * h),
      requestedAt: new Date(now - 170 * h),
      ...stamps,
    },
  });
  console.log(`${state.padEnd(18)} /bookings/${b.id}`);
}

console.log(`\nboat:  ${BOAT.email} / ${BOAT.password}`);
console.log(`crew:  ${CREW.email} / ${CREW.password}  (drives "${profile.displayName}")`);
await prisma.$disconnect();
