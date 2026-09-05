import "server-only";
import { prisma } from "@crewmarket/db";
import type { BookingState } from "@crewmarket/types";
import { bookingStateCounts, splitFees, verifiedProfileCount } from "./admin-metrics-rules";

/* Admin metrics (SOW 2.i). Every figure derives from existing rows — nothing
   hand-entered (SOW 7.iii). Aggregates only (M-2/P-4). */

export type AdminMetrics = {
  revenue: { realizedFeeCents: number; heldFeeCents: number; simulated: boolean };
  bookings: { total: number; byState: Record<BookingState, number> };
  verification: { verifiedProfiles: number; verifiedDocs: number; awaitingReview: number };
  accounts: { crew: number; boat: number };
};

/**
 * SOW 7.iii swap point: the Stripe phase replaces THIS function with Stripe
 * reporting reads, and stops passing booking rows in from computeMetrics.
 * Until then revenue is derived from the same booking rows the caller already
 * fetched, and the UI labels it simulated.
 */
function simulatedRevenueFromBookings(
  rows: { state: string; feeCents: number }[]
): AdminMetrics["revenue"] {
  return { ...splitFees(rows), simulated: true as const };
}

export async function computeMetrics(): Promise<AdminMetrics> {
  const [bookingRows, verifiedDocs, awaitingReview, crew, boat] = await Promise.all([
    prisma.booking.findMany({ select: { state: true, feeCents: true } }),
    prisma.credentialDoc.findMany({
      where: { verifiedAt: { not: null } },
      select: { profileId: true }, // s3Key not selected — never needed here (V-2)
    }),
    prisma.credentialDoc.count({ where: { verifiedAt: null } }),
    prisma.user.count({ where: { accountType: "CREW" } }),
    prisma.user.count({ where: { accountType: "BOAT" } }),
  ]);
  return {
    revenue: simulatedRevenueFromBookings(bookingRows),
    bookings: { total: bookingRows.length, byState: bookingStateCounts(bookingRows) },
    verification: {
      verifiedProfiles: verifiedProfileCount(verifiedDocs),
      verifiedDocs: verifiedDocs.length,
      awaitingReview,
    },
    accounts: { crew, boat },
  };
}
