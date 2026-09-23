import {
  computeQuote,
  maxDaysFor,
  type BookingQuote,
  type CrewRates,
  type TripType,
} from "@crewmarket/types";

/* Pure logic for the native booking-request form (slice 5). The money math is
   the SAME computeQuote the web form and the server use — imported, not
   mirrored. Everything here is preview/validation only: the server recomputes
   the quote at create (R4) and enforces every guard again. */

export type RequestDraft = {
  tripType: TripType;
  days: number;
  startDate: string; // ISO YYYY-MM-DD, "" until picked
  piAttested: boolean;
};

/** Stepper guard: integer days inside 1..maxDaysFor(tripType). */
export function clampDays(tripType: TripType, days: number): number {
  return Math.min(Math.max(1, Math.round(days)), maxDaysFor(tripType));
}

/** Single-date trip types always book exactly one day, whatever the stepper held. */
export function effectiveDays(tripType: TripType, days: number): number {
  return maxDaysFor(tripType) === 1 ? 1 : days;
}

export function draftQuote(rates: CrewRates, d: RequestDraft): BookingQuote | null {
  return computeQuote(rates, d.tripType, effectiveDays(d.tripType, d.days));
}

/** Submit gate: a valid quote, a picked date, and the P&I attestation (D-4). */
export function canSubmit(rates: CrewRates, d: RequestDraft): boolean {
  return Boolean(
    draftQuote(rates, d) && /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) && d.piAttested
  );
}

/** Exactly the POST /api/bookings body — the server shape-coerces and re-guards. */
export function draftPayload(crewProfileId: string, d: RequestDraft) {
  return {
    crewProfileId,
    tripType: d.tripType,
    startDate: d.startDate,
    days: effectiveDays(d.tripType, d.days),
    piAttested: d.piAttested,
  };
}

/** Local-timezone YYYY-MM-DD — Date#toISOString is UTC and shifts the day west of UTC. */
export function localIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
