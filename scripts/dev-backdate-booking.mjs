#!/usr/bin/env node
// dev-backdate-booking.mjs — DEV ONLY: backdate a booking's completedAt so the
// 48h delayed-payout window (P-2) has elapsed and the next ledger read releases
// the crew payout. Used by the live test-mode drive (HANDOFF: Payments).
// Run:  node --env-file=.env.local scripts/dev-backdate-booking.mjs <bookingId> [hoursAgo=49]
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");

const [id, hours = "49"] = process.argv.slice(2);
if (!id) {
  console.error("usage: node --env-file=.env.local scripts/dev-backdate-booking.mjs <bookingId> [hoursAgo]");
  process.exit(1);
}
const hoursNum = Number(hours);
if (!Number.isFinite(hoursNum) || hoursNum < 0) {
  console.error("hoursAgo must be a non-negative number");
  process.exit(1);
}

const prisma = new PrismaClient();
const completedAt = new Date(Date.now() - hoursNum * 3600_000);
const row = await prisma.booking.update({ where: { id }, data: { completedAt } });
console.log(`booking ${row.id}: completedAt -> ${completedAt.toISOString()} (state ${row.state})`);
await prisma.$disconnect();
