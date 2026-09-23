import "server-only";
import { prisma, type Booking } from "@crewmarket/db";
import {
  computeQuote,
  datesFrom,
  maxDaysFor,
  tripTypesFor,
  TRIP_TYPES,
  type TripType,
} from "@crewmarket/types";
import { crewProfileById } from "./bookings";

/* Booking creation core (slice 5) — the ONE home for the creation guards,
   shared by the web server action and POST /api/bookings (pattern:
   credential-service.ts). Guard order and error copy are frozen — both
   wrappers surface these strings verbatim.
   R4: the quote is recomputed here from crew-listed rates — client money
   math is never trusted. D-4: the booking row cannot exist without the
   P&I attestation. M-2: only crew-listed trip types are bookable. */

export type CreateBookingInput = {
  crewProfileId: string;
  tripType: string;
  startDate: string; // ISO YYYY-MM-DD
  days: number;
  piAttested: boolean;
};

/** Narrow via `"error" in result` — apps/web is strict:false, so a boolean
    discriminant would not narrow (see the slice-3 build-fix lesson). */
export type CreateBookingResult =
  | { booking: Booking }
  | { error: string; status: 400 | 403 };

export async function createBookingRequest(
  user: { id: string; accountType?: string },
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  if (user.accountType !== "BOAT") {
    return { error: "Only boat accounts send booking requests.", status: 403 };
  }

  const crew = crewProfileById(input.crewProfileId);
  if (!crew) return { error: "Unknown crew profile.", status: 400 };

  const tripType = input.tripType as TripType;
  if (!TRIP_TYPES.includes(tripType) || !tripTypesFor(crew).includes(tripType)) {
    return { error: "Choose a trip type this crew member lists a rate for.", status: 400 };
  }

  // Regex alone admits impossible dates ("2026-02-31" rolls over, "2026-13-01"
  // throws inside datesFrom) — the UTC round-trip pins a real calendar date.
  const startDay = new Date(input.startDate + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
    Number.isNaN(startDay.getTime()) ||
    startDay.toISOString().slice(0, 10) !== input.startDate
  ) {
    return { error: "Pick a start date.", status: 400 };
  }

  const days = maxDaysFor(tripType) === 1 ? 1 : input.days;
  const quote = computeQuote(crew, tripType, days);
  if (!quote) return { error: `Days must be between 1 and ${maxDaysFor(tripType)}.`, status: 400 };

  if (!input.piAttested) {
    return { error: "Confirm the vessel carries P&I coverage for this trip.", status: 400 };
  }

  const booking = await prisma.booking.create({
    data: {
      crewProfileId: input.crewProfileId,
      boatUserId: user.id,
      tripType,
      dates: datesFrom(input.startDate, days),
      rateCents: quote.rateCents,
      feeCents: quote.feeCents,
      piAttestedAt: new Date(),
    },
  });
  return { booking };
}
