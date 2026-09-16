import "server-only";
import { prisma } from "@crewmarket/db";
import { isCancelState, refundBookingPayment, refundCentsFor } from "@crewmarket/payments";
import { canTransition, transition, type BookingEvent, type BookingState } from "@crewmarket/types";
import { partyRoleFor, type PartyRole } from "./bookings";

export type UserEvent = Exclude<
  BookingEvent["type"],
  "PAYOUT_SCHEDULED" | "DISPUTE_WINDOW_ELAPSED" | "ESCROW_CONFIRMED"
>;

/** Which side may fire which event. TRIP_START/TRIP_COMPLETE are attestations either
    party may record — never supervision (M-3). */
export const EVENT_SIDES: Record<UserEvent, PartyRole[]> = {
  CREW_ACCEPT: ["CREW"],
  CREW_DECLINE: ["CREW"],
  CANCEL_BOAT: ["BOAT"],
  CANCEL_CREW: ["CREW"],
  CANCEL_WEATHER: ["BOAT", "CREW"],
  TRIP_START: ["BOAT", "CREW"],
  TRIP_COMPLETE: ["BOAT", "CREW"],
};

const TIMESTAMPS: Partial<Record<UserEvent, "acceptedAt" | "fundsHeldAt" | "tripStartedAt">> = {
  CREW_ACCEPT: "acceptedAt",
  TRIP_START: "tripStartedAt",
};

/** Events the given role may fire from the given state right now. */
export function availableEventsFor(state: BookingState, role: PartyRole): UserEvent[] {
  return (Object.keys(EVENT_SIDES) as UserEvent[]).filter(
    (e) => EVENT_SIDES[e].includes(role) && canTransition(state, e),
  );
}

export type ApplyResult =
  | { ok: true; state: BookingState }
  | { ok: false; status: number; error: string };

/** The money-critical booking-event core (shared by the web action and the API route).
    Loads the booking, enforces the party+EVENT_SIDES gate, drives transition(),
    refunds-first on cancel, and CAS-writes. NO redirect/revalidate. */
export async function applyBookingEvent(
  userId: string, bookingId: string, event: UserEvent,
): Promise<ApplyResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, status: 404, error: "Booking not found." };

  const role = await partyRoleFor(booking, userId);
  if (!role || !EVENT_SIDES[event]?.includes(role)) {
    return { ok: false, status: 403, error: "You can't take that action on this booking." };
  }

  const from = booking.state as BookingState;
  let next = transition(from, event);
  if (!next) return { ok: false, status: 409, error: "That action isn't available right now." };

  const data: Record<string, unknown> = { state: next };
  const stamp = TIMESTAMPS[event];
  if (stamp) data[stamp] = new Date();

  if (event === "TRIP_COMPLETE") {
    const completedAt = new Date();
    data.completedAt = completedAt;
    const windowState = transition(next, "PAYOUT_SCHEDULED");
    if (windowState) next = windowState;
    data.state = next;
  }

  if (isCancelState(next) || next === "PAID_OUT") data.closedAt = new Date();

  // Refund first, transition second (G-1 tiers are placeholder config): a failed
  // refund throws out of here, leaving state unchanged and the cancel retryable.
  if (isCancelState(next) && booking.stripePaymentIntentId && !booking.stripeRefundId) {
    const refundCents = refundCentsFor(next, booking.rateCents + booking.feeCents);
    if (refundCents > 0) {
      // Idempotency key is amount/target-agnostic: safe while all tiers are 1.0 —
      // revisit if tiers ever diverge from a full refund.
      data.stripeRefundId = await refundBookingPayment(
        booking.stripePaymentIntentId, refundCents, `cancel-refund-${booking.id}`,
      );
    }
  }

  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, state: from }, // CAS
    data,
  });
  if (updated.count === 0) {
    if (data.stripeRefundId) {
      console.error(`booking ${bookingId}: refund ${data.stripeRefundId} issued but ${event} lost the state race`);
      await prisma.booking.update({ where: { id: bookingId }, data: { stripeRefundId: data.stripeRefundId } });
    }
    return { ok: false, status: 409, error: "The booking changed — refresh." };
  }
  return { ok: true, state: next as BookingState };
}
