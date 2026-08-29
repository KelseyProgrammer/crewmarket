import "server-only";
import { headers } from "next/headers";
import { prisma, type Booking } from "@crewmarket/db";
import {
  DISPUTE_WINDOW_HOURS,
  payoutReleasable,
  transition,
  type BookingState,
  type CrewRates,
  type TripType,
} from "@crewmarket/types";
import { auth } from "./auth";
import seed from "../data/seed-crew.json";

/* Booking flow data layer (docs/BOOKING_BRIEF.md). A booking has exactly two
   parties — the boat account that requested it and the crew account that has
   claimed the registry profile (demo bridge for the crew-identity gap). Only
   those two ever load the ledger. */

export type SeedProfile = CrewRates & {
  id: string;
  displayName: string;
  homePort: string;
  roles: string[];
};

const profiles = (seed as { profiles: SeedProfile[] }).profiles;

export function crewProfileById(id: string): SeedProfile | null {
  return profiles.find((p) => p.id === id) ?? null;
}

export function allSeedProfiles(): SeedProfile[] {
  return profiles;
}

export async function sessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export type PartyRole = "BOAT" | "CREW";

/** The crew profile this user drives, if any (demo claim). */
export async function claimedProfileId(userId: string): Promise<string | null> {
  const claim = await prisma.crewProfileClaim.findUnique({ where: { userId } });
  return claim?.profileId ?? null;
}

/** Which side of this booking the user is on — null means not a party. */
export async function partyRoleFor(booking: Booking, userId: string): Promise<PartyRole | null> {
  if (booking.boatUserId === userId) return "BOAT";
  const profileId = await claimedProfileId(userId);
  return profileId === booking.crewProfileId ? "CREW" : null;
}

/** When the crew payout releases, given the 48h delayed-payout window (P-2). */
export function payoutReleaseAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + DISPUTE_WINDOW_HOURS * 3600_000);
}

/**
 * DISPUTE_WINDOW_ELAPSED is a system event: applied lazily on read once the
 * window has passed, through the machine like every other transition.
 */
export async function withElapsedWindow(booking: Booking): Promise<Booking> {
  if (booking.state !== "DISPUTE_WINDOW" || !booking.completedAt) return booking;
  if (!payoutReleasable(booking.state as BookingState, booking.completedAt)) return booking;
  const next = transition(booking.state as BookingState, "DISPUTE_WINDOW_ELAPSED");
  if (!next) return booking;
  return prisma.booking.update({
    where: { id: booking.id },
    data: { state: next, closedAt: new Date() },
  });
}

export async function bookingsForUser(userId: string, role: "BOAT" | "CREW"): Promise<Booking[]> {
  if (role === "BOAT") {
    const rows = await prisma.booking.findMany({
      where: { boatUserId: userId },
      orderBy: { requestedAt: "desc" },
    });
    return Promise.all(rows.map(withElapsedWindow));
  }
  const profileId = await claimedProfileId(userId);
  if (!profileId) return [];
  const rows = await prisma.booking.findMany({
    where: { crewProfileId: profileId },
    orderBy: { requestedAt: "desc" },
  });
  return Promise.all(rows.map(withElapsedWindow));
}

export function bookingDates(booking: Booking): string[] {
  return Array.isArray(booking.dates) ? (booking.dates as string[]) : [];
}

/** "Sep 12" / "Sep 12–14" — coarse dates only (D-3). */
export function fmtTripDates(dates: string[]): string {
  if (dates.length === 0) return "—";
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dates.length === 1) return fmt(dates[0]);
  const last = new Date(dates[dates.length - 1] + "T00:00:00");
  const sameMonth = dates[0].slice(0, 7) === dates[dates.length - 1].slice(0, 7);
  return sameMonth ? `${fmt(dates[0])}–${last.getDate()}` : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Registry-style voyage number from the cuid — display furniture, not an id the user types. */
export function voyageNo(booking: Booking): string {
  return `VOYAGE Nº ${booking.id.slice(-6).toUpperCase()}`;
}

export function tripTypeOf(booking: Booking): TripType {
  return booking.tripType as TripType;
}
