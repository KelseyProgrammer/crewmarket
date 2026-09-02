"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import {
  computeQuote,
  datesFrom,
  maxDaysFor,
  transition,
  tripTypesFor,
  TRIP_TYPES,
  type BookingEvent,
  type BookingState,
  type TripType,
} from "@crewmarket/types";
import {
  crewProfileById,
  partyRoleFor,
  sessionUser,
  type PartyRole,
} from "../../lib/bookings";

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

/** Which side may fire which event. TRIP_START / TRIP_COMPLETE are attestations
    either party may record — never supervision features (M-3). */
const EVENT_SIDES: Record<Exclude<BookingEvent["type"], "PAYOUT_SCHEDULED" | "DISPUTE_WINDOW_ELAPSED">, PartyRole[]> = {
  CREW_ACCEPT: ["CREW"],
  CREW_DECLINE: ["CREW"],
  CANCEL_BOAT: ["BOAT"],
  CANCEL_CREW: ["CREW"],
  CANCEL_WEATHER: ["BOAT", "CREW"],
  ESCROW_CONFIRMED: ["BOAT"], // simulated until the Stripe phase (SOW 6.i)
  TRIP_START: ["BOAT", "CREW"],
  TRIP_COMPLETE: ["BOAT", "CREW"],
};

const TIMESTAMPS: Partial<Record<keyof typeof EVENT_SIDES, "acceptedAt" | "fundsHeldAt" | "tripStartedAt">> = {
  CREW_ACCEPT: "acceptedAt",
  ESCROW_CONFIRMED: "fundsHeldAt",
  TRIP_START: "tripStartedAt",
};

export async function bookingEventAction(bookingId: string, eventType: keyof typeof EVENT_SIDES) {
  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/${bookingId}`);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;

  const role = await partyRoleFor(booking, user.id);
  if (!role || !EVENT_SIDES[eventType]?.includes(role)) return;

  const from = booking.state as BookingState;
  let next = transition(from, eventType);
  if (!next) {
    // Stale tab: the state moved under this button. Re-render current truth.
    revalidatePath(`/bookings/${bookingId}`);
    return;
  }

  const data: Record<string, unknown> = { state: next };
  const stamp = TIMESTAMPS[eventType];
  if (stamp) data[stamp] = new Date();

  if (eventType === "TRIP_COMPLETE") {
    // System event PAYOUT_SCHEDULED applies at the same moment (P-2): the ledger
    // always shows the 48h delayed-payout window, never a bare COMPLETED.
    const completedAt = new Date();
    data.completedAt = completedAt;
    const windowState = transition(next, "PAYOUT_SCHEDULED");
    if (windowState) next = windowState;
    data.state = next;
  }

  if (["CANCELLED_WEATHER", "CANCELLED_BOAT", "CANCELLED_CREW", "PAID_OUT"].includes(next)) {
    data.closedAt = new Date();
  }

  await prisma.booking.update({ where: { id: bookingId }, data });
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
}
