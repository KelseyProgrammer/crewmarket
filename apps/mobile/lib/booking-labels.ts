// Pure booking event/state label helper — mobile-facing copy (no RN imports).
//
// Marketplace vocabulary discipline (M-1/G-1): crew are independent
// contractors, not staff. Declining is penalty-free ("Decline", never
// language that supervises or penalizes). Held funds are "Funds held" —
// the word "escrow" must NEVER surface in user-facing copy (G-1).
//
// STATE_LABELS mirrors the canonical map in packages/ui/src/components.tsx
// EXACTLY (frozen vocabulary) so mobile and web read identically. If the
// web map changes, mirror it here.
import { fmtUsd } from "@crewmarket/types";

const EVENT_LABELS: Record<string, string> = {
  CREW_ACCEPT: "Accept booking",
  CREW_DECLINE: "Decline",
  CANCEL_BOAT: "Cancel booking",
  CANCEL_CREW: "Cancel booking",
  CANCEL_WEATHER: "Cancel — weather",
  TRIP_START: "Start trip",
  TRIP_COMPLETE: "Trip complete",
};

/** User-facing verb for a booking event; unknown events fall back to the raw key. */
export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

/** Mirrors packages/ui/src/components.tsx STATE_LABELS exactly (canonical). */
export const STATE_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  ESCROW_FUNDED: "Funds held",
  IN_PROGRESS: "Underway",
  COMPLETED: "Trip complete",
  DISPUTE_WINDOW: "48h review",
  PAID_OUT: "Paid out",
  CANCELLED_WEATHER: "Weather cancellation",
  CANCELLED_BOAT: "Cancelled by boat",
  CANCELLED_CREW: "Cancelled by crew",
};

/** CTA to move a booking into the funds-held state — never "escrow" (G-1). */
export function holdFundsLabel(totalCents: number): string {
  return `Hold funds — ${fmtUsd(totalCents)}`;
}
