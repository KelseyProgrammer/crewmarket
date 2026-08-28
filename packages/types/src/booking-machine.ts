/**
 * booking-machine.ts — Booking state machine (SOW 2.i "Booking Flow").
 * CANCELLED_WEATHER is a first-class state (weather is the dominant cancellation
 * cause in this industry; refund tiering differs from no-shows — policy input, G-1).
 * Payout timing encodes P-2: escrow funds at booking, payout after COMPLETED + 48h window.
 */

export type BookingState =
  | "REQUESTED"
  | "ACCEPTED"
  | "ESCROW_FUNDED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISPUTE_WINDOW"
  | "PAID_OUT"
  | "CANCELLED_WEATHER"
  | "CANCELLED_BOAT"
  | "CANCELLED_CREW";

/** SOW 2.i / rule P-2: post-trip dispute window before payout release. */
export const DISPUTE_WINDOW_HOURS = 48;

export type BookingEvent =
  | { type: "CREW_ACCEPT" }            // crew accepts at their sole discretion (M-2)
  | { type: "CREW_DECLINE" }           // declining carries no penalty anywhere in the system (M-2)
  | { type: "ESCROW_CONFIRMED" }       // Stripe PaymentIntent funds held
  | { type: "TRIP_START" }
  | { type: "TRIP_COMPLETE" }
  | { type: "PAYOUT_SCHEDULED" }       // system event: delayed payout timer armed at completion
  | { type: "DISPUTE_WINDOW_ELAPSED" } // 48h after COMPLETED, no open dispute
  | { type: "CANCEL_WEATHER" }         // either party; refund tier is policy config, not code (G-1)
  | { type: "CANCEL_BOAT" }
  | { type: "CANCEL_CREW" };

type Transition = { on: BookingEvent["type"]; to: BookingState };

const TRANSITIONS: Record<BookingState, Transition[]> = {
  REQUESTED: [
    { on: "CREW_ACCEPT", to: "ACCEPTED" },
    { on: "CREW_DECLINE", to: "CANCELLED_CREW" },
    { on: "CANCEL_BOAT", to: "CANCELLED_BOAT" },
  ],
  ACCEPTED: [
    { on: "ESCROW_CONFIRMED", to: "ESCROW_FUNDED" },
    { on: "CANCEL_WEATHER", to: "CANCELLED_WEATHER" },
    { on: "CANCEL_BOAT", to: "CANCELLED_BOAT" },
    { on: "CANCEL_CREW", to: "CANCELLED_CREW" },
  ],
  ESCROW_FUNDED: [
    { on: "TRIP_START", to: "IN_PROGRESS" },
    { on: "CANCEL_WEATHER", to: "CANCELLED_WEATHER" },
    { on: "CANCEL_BOAT", to: "CANCELLED_BOAT" },
    { on: "CANCEL_CREW", to: "CANCELLED_CREW" },
  ],
  IN_PROGRESS: [
    { on: "TRIP_COMPLETE", to: "COMPLETED" },
    { on: "CANCEL_WEATHER", to: "CANCELLED_WEATHER" }, // blown-out mid-charter is real
  ],
  COMPLETED: [{ on: "PAYOUT_SCHEDULED", to: "DISPUTE_WINDOW" }],
  DISPUTE_WINDOW: [{ on: "DISPUTE_WINDOW_ELAPSED", to: "PAID_OUT" }],
  PAID_OUT: [],
  CANCELLED_WEATHER: [],
  CANCELLED_BOAT: [],
  CANCELLED_CREW: [],
};

export const TERMINAL_STATES: ReadonlySet<BookingState> = new Set([
  "PAID_OUT",
  "CANCELLED_WEATHER",
  "CANCELLED_BOAT",
  "CANCELLED_CREW",
]);

export function canTransition(from: BookingState, event: BookingEvent["type"]): boolean {
  return TRANSITIONS[from].some((t) => t.on === event);
}

/** Returns the next state, or null if the event is invalid in the current state. */
export function transition(from: BookingState, event: BookingEvent["type"]): BookingState | null {
  return TRANSITIONS[from].find((t) => t.on === event)?.to ?? null;
}

/** True when Stripe payout to crew may be released (P-2). */
export function payoutReleasable(state: BookingState, completedAt: Date, now: Date = new Date()): boolean {
  if (state !== "DISPUTE_WINDOW" && state !== "COMPLETED") return false;
  return now.getTime() - completedAt.getTime() >= DISPUTE_WINDOW_HOURS * 3600_000;
}
