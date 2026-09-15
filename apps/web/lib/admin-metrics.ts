import "server-only";
import { prisma } from "@crewmarket/db";
import type { BookingState } from "@crewmarket/types";
import { stripeRevenue, type StripeRevenue } from "@crewmarket/payments";
import { bookingStateCounts, splitFees, verifiedProfileCount } from "./admin-metrics-rules";
import { createTtlCache } from "./ttl-cache";

/* Admin metrics (SOW 2.i). Every figure derives from existing rows or Stripe
   reporting — nothing hand-entered (SOW 7.iii). Aggregates only (M-2/P-4). */

type Revenue =
  | ({ source: "stripe" } & StripeRevenue)
  | { source: "simulated"; realizedFeeCents: number; heldFeeCents: number };

export type AdminMetrics = {
  revenue: Revenue;
  bookings: { total: number; byState: Record<BookingState, number> };
  verification: { verifiedProfiles: number; verifiedDocs: number; awaitingReview: number };
  accounts: { crew: number; boat: number };
};

/**
 * Simulated fallback: revenue derived from the same booking rows the caller
 * already fetched. Used when Stripe is not configured or its reporting read
 * fails; the UI labels it simulated.
 */
function simulatedRevenue(rows: { state: string; feeCents: number }[]): Revenue {
  return { source: "simulated", ...splitFees(rows) };
}

// 60s cache: one platform-wide aggregate. createTtlCache does not cache a rejected
// load (entry is only set in .then), so a Stripe failure is not poisoned into the
// window — the catch below still falls back per-request.
const revenueCache = createTtlCache(stripeRevenue, 60_000);

async function revenueFor(rows: { state: string; feeCents: number }[]): Promise<Revenue> {
  if (!process.env.STRIPE_SECRET_KEY) return simulatedRevenue(rows);
  try {
    return { source: "stripe", ...(await revenueCache.get()) };
  } catch (err) {
    console.error("admin metrics: stripeRevenue failed, falling back to simulated", err);
    return simulatedRevenue(rows);
  }
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
    revenue: await revenueFor(bookingRows),
    bookings: { total: bookingRows.length, byState: bookingStateCounts(bookingRows) },
    verification: {
      verifiedProfiles: verifiedProfileCount(verifiedDocs),
      verifiedDocs: verifiedDocs.length,
      awaitingReview,
    },
    accounts: { crew, boat },
  };
}
