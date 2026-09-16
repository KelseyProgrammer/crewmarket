"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import { createBookingCheckout } from "@crewmarket/payments";
import {
  computeQuote,
  datesFrom,
  maxDaysFor,
  tripTypesFor,
  TRIP_TYPES,
  TRIP_TYPE_LABELS,
  type TripType,
} from "@crewmarket/types";
import { crewProfileById, partyRoleFor, sessionUser } from "../../lib/bookings";
import { applyBookingEvent, type UserEvent } from "../../lib/booking-events";

/* Voyage Ledger actions (docs/BOOKING_BRIEF.md). Every action re-checks the
   session and party role server-side and drives the state machine with
   transition() — an invalid event (stale tab) is a no-op that re-renders the
   current state, never an error page. */

export type RequestFormState = { error?: string };

export async function createBookingAction(
  _prev: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/bookings/new");
  if (user.accountType !== "BOAT") {
    return { error: "Only boat accounts send booking requests." };
  }

  const crewProfileId = String(formData.get("crewProfileId") ?? "");
  const crew = crewProfileById(crewProfileId);
  if (!crew) return { error: "Unknown crew profile." };

  const tripType = String(formData.get("tripType") ?? "") as TripType;
  if (!TRIP_TYPES.includes(tripType) || !tripTypesFor(crew).includes(tripType)) {
    return { error: "Choose a trip type this crew member lists a rate for." };
  }

  const startDate = String(formData.get("startDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: "Pick a start date." };
  }

  const days = maxDaysFor(tripType) === 1 ? 1 : Number(formData.get("days") ?? 1);
  // R4: the quote is recomputed here from crew-listed rates — client math is never trusted.
  const quote = computeQuote(crew, tripType, days);
  if (!quote) return { error: `Days must be between 1 and ${maxDaysFor(tripType)}.` };

  // D-4: the request cannot exist without the P&I attestation.
  if (formData.get("piAttested") !== "on") {
    return { error: "Confirm the vessel carries P&I coverage for this trip." };
  }

  const booking = await prisma.booking.create({
    data: {
      crewProfileId,
      boatUserId: user.id,
      tripType,
      dates: datesFrom(startDate, days),
      rateCents: quote.rateCents,
      feeCents: quote.feeCents,
      piAttestedAt: new Date(),
    },
  });

  revalidatePath("/bookings");
  redirect(`/bookings/${booking.id}`);
}

/** Boat's primary action at ACCEPTED: capture into the platform balance via
    Checkout (separate charges & transfers). State does NOT change here — the
    webhook is the source of truth for ESCROW_FUNDED. */
export async function beginBookingCheckout(bookingId: string) {
  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/${bookingId}`);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  const role = await partyRoleFor(booking, user.id);
  if (role !== "BOAT") return;
  if (booking.state !== "ACCEPTED") {
    revalidatePath(`/bookings/${bookingId}`);
    return; // stale tab
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = await createBookingCheckout(
    {
      bookingId,
      tripLabel: `${TRIP_TYPE_LABELS[booking.tripType as TripType]} — crew booking`,
      rateCents: booking.rateCents,
      feeCents: booking.feeCents,
    },
    {
      successUrl: `${base}/bookings/${bookingId}?paid=pending`,
      cancelUrl: `${base}/bookings/${bookingId}`,
    }
  );
  redirect(url);
}

/** Thin web wrapper over the shared money-critical core (lib/booking-events.ts):
    re-check the session, apply the event, then revalidate. Errors from
    applyBookingEvent (stale tab, non-party, invalid event) are no-ops on web —
    the page simply re-renders current truth (M-2/M-3 gate lives in the core). */
export async function bookingEventAction(bookingId: string, eventType: UserEvent) {
  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/${bookingId}`);
  await applyBookingEvent(user.id, bookingId, eventType); // errors are stale-tab no-ops on web
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
}
