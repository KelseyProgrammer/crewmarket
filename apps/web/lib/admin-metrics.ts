import "server-only";
import { prisma } from "@crewmarket/db";
import type { BookingState } from "@crewmarket/types";
import { bookingStateCounts, splitFees, verifiedProfileCount } from "./admin-metrics-rules";

/* Admin metrics (SOW 2.i). Every figure derives from existing rows — nothing
   hand-entered (SOW 7.iii). Aggregates only (M-2/P-4). */

export type AdminMetrics = {
  revenue: { realizedFeeCents: number; heldFeeCents: number; simulated: true };
  bookings: { total: number; byState: Record<BookingState, number> };
  verification: { verifiedProfiles: number; verifiedDocs: number; awaitingReview: number };
  accounts: { crew: number; boat: number };
};

/**
 * SOW 7.iii swap point: the Stripe phase replaces THIS function with Stripe
 * reporting reads. Until then revenue is derived from booking records and the
 * UI labels it simulated.
 */
async function simulatedRevenueFromBookings(): Promise<AdminMetrics["revenue"]> {
  const rows = await prisma.booking.findMany({ select: { state: true, feeCents: true } });
  return { ...splitFees(rows), simulated: true };
}

export async function computeMetrics(): Promise<AdminMetrics> {
  const [revenue, bookingRows, verifiedDocs, awaitingReview, crew, boat] = await Promise.all([
    simulatedRevenueFromBookings(),
    prisma.booking.findMany({ select: { state: true } }),
    prisma.credentialDoc.findMany({
      where: { verifiedAt: { not: null } },
      select: { profileId: true }, // s3Key not selected — never needed here (V-2)
    }),
    prisma.credentialDoc.count({ where: { verifiedAt: null } }),
    prisma.user.count({ where: { accountType: "CREW" } }),
    prisma.user.count({ where: { accountType: "BOAT" } }),
  ]);
  return {
    revenue,
    bookings: { total: bookingRows.length, byState: bookingStateCounts(bookingRows) },
    verification: {
      verifiedProfiles: verifiedProfileCount(verifiedDocs),
      verifiedDocs: verifiedDocs.length,
      awaitingReview,
    },
    accounts: { crew, boat },
  };
}
