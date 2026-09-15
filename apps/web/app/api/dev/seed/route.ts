import { prisma } from "@crewmarket/db";
import seed from "../../../../data/seed-crew.json";

/* TEMPORARY one-time demo seed for the Vercel deploy — token-gated, removed after use.
   Creates a demo BOAT + CREW account (via the app's own Better Auth signup), claims a
   MATE profile for the crew account (there is no claim UI — it's the demo bridge), and
   leaves one REQUESTED booking so the crew can accept and the boat can pay end-to-end.
   All synthetic. Gated by SEED_TOKEN; returns 404 unless the token matches. */

export const dynamic = "force-dynamic";

const BOAT = { email: "boat@example.com", password: "demo-boat-pass-1", name: "Reel Weekend (demo boat)" };
const CREW = { email: "mate@example.com", password: "demo-crew-pass-1", name: "Demo Crew Account" };

type Profile = { id: string; roles: string[]; dayRateUsd: number; displayName: string };

async function ensureUser(origin: string, u: typeof BOAT, accountType: "BOAT" | "CREW") {
  const existing = await prisma.user.findUnique({ where: { email: u.email } });
  if (existing) return existing;
  const res = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ ...u, accountType, disclaimerAccepted: true }),
  });
  if (!res.ok) throw new Error(`sign-up ${u.email}: ${res.status} ${await res.text()}`);
  return prisma.user.findUnique({ where: { email: u.email } });
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
    return new Response("not found", { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const boat = await ensureUser(origin, BOAT, "BOAT");
  const crewUser = await ensureUser(origin, CREW, "CREW");
  if (!boat || !crewUser) return new Response("user creation failed", { status: 500 });

  const profile = (seed as { profiles: Profile[] }).profiles.find((p) => p.roles.includes("MATE"));
  if (!profile) return new Response("no MATE profile in seed", { status: 500 });

  await prisma.crewProfileClaim.deleteMany({
    where: { OR: [{ userId: crewUser.id }, { profileId: profile.id }] },
  });
  await prisma.crewProfileClaim.create({ data: { userId: crewUser.id, profileId: profile.id } });

  const rateCents = Math.round(profile.dayRateUsd * 100);
  const feeCents = Math.round(rateCents * 0.12);
  const date = new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);

  await prisma.booking.deleteMany({ where: { boatUserId: boat.id } });
  const booking = await prisma.booking.create({
    data: {
      crewProfileId: profile.id,
      boatUserId: boat.id,
      tripType: "FULL_DAY",
      dates: [date],
      rateCents,
      feeCents,
      state: "REQUESTED",
      piAttestedAt: new Date(),
    },
  });

  return Response.json({
    ok: true,
    boat: BOAT.email,
    crew: CREW.email,
    claimedProfile: { id: profile.id, name: profile.displayName },
    requestedBookingId: booking.id,
    note: "Log in as the boat to see the request, or as the crew to accept it.",
  });
}
