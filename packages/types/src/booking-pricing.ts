/**
 * booking-pricing.ts — money math for the booking flow (docs/BOOKING_BRIEF.md).
 * The quote derives mechanically from crew-listed rates × trip type × days — no
 * negotiation in v1 and the platform never sets or suggests a rate (M-2).
 * Fee is itemized (P-3) from the one config constant below. All amounts are
 * integer cents (Stripe-ready for the payments phase).
 */

/** OPEN client decisions (docs/BUSINESS_MODEL.md): the UI renders whatever these say. */
export const PLATFORM_FEE_RATE = 0.12;
export const PLATFORM_FEE_SIDE: "BOAT" | "CREW" = "BOAT";

export const TRIP_TYPES = ["FULL_DAY", "HALF_DAY", "MULTI_DAY", "TOURNAMENT"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  FULL_DAY: "Full day",
  HALF_DAY: "Half day",
  MULTI_DAY: "Multi-day",
  TOURNAMENT: "Tournament",
};

export type CrewRates = {
  dayRateUsd: number;
  halfDayRateUsd?: number;
  tournamentRateUsd?: number;
};

/** A trip type is offered only when the crew member has listed a rate for it (M-2). */
export function tripTypesFor(rates: CrewRates): TripType[] {
  return TRIP_TYPES.filter((t) => perDayCents(rates, t) !== null);
}

/** Crew-listed per-day basis for a trip type, in cents; null when the crew lists no such rate. */
export function perDayCents(rates: CrewRates, tripType: TripType): number | null {
  switch (tripType) {
    case "FULL_DAY":
    case "MULTI_DAY":
      return Math.round(rates.dayRateUsd * 100);
    case "HALF_DAY":
      return rates.halfDayRateUsd != null ? Math.round(rates.halfDayRateUsd * 100) : null;
    case "TOURNAMENT":
      return rates.tournamentRateUsd != null ? Math.round(rates.tournamentRateUsd * 100) : null;
  }
}

/** Single-date trips; MULTI_DAY / TOURNAMENT run consecutive days, capped for v1. */
export function maxDaysFor(tripType: TripType): number {
  return tripType === "MULTI_DAY" || tripType === "TOURNAMENT" ? 10 : 1;
}

export type BookingQuote = {
  rateCents: number; // crew rate basis × days — what the crew receives
  feeCents: number; // itemized platform fee (P-3)
  totalCents: number; // what the fee side pays in full
};

/** The same numbers from the request screen onward (R4) — recomputed server-side at create. */
export function computeQuote(rates: CrewRates, tripType: TripType, days: number): BookingQuote | null {
  const perDay = perDayCents(rates, tripType);
  if (perDay === null) return null;
  if (!Number.isInteger(days) || days < 1 || days > maxDaysFor(tripType)) return null;
  const rateCents = perDay * days;
  const feeCents = Math.round(rateCents * PLATFORM_FEE_RATE);
  return { rateCents, feeCents, totalCents: rateCents + feeCents };
}

export function fmtUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Consecutive ISO dates starting at startDate — the booking's `dates` value. */
export function datesFrom(startDate: string, days: number): string[] {
  const out: string[] = [];
  const d = new Date(startDate + "T00:00:00Z");
  for (let i = 0; i < days; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
