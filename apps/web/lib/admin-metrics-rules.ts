/* Pure aggregation for the admin metrics dashboard — no I/O, unit-tested.
   Aggregates only: nothing here ranks or lists individual crew (M-2/P-4). */

import type { BookingState } from "@crewmarket/types";

/** Funds-held lifecycle: fee is committed but not yet realized (P-2 window). */
export const HELD_FEE_STATES: ReadonlySet<BookingState> = new Set([
  "ESCROW_FUNDED",
  "IN_PROGRESS",
  "COMPLETED",
  "DISPUTE_WINDOW",
]);

const ZERO_COUNTS: Record<BookingState, number> = {
  REQUESTED: 0,
  ACCEPTED: 0,
  ESCROW_FUNDED: 0,
  IN_PROGRESS: 0,
  COMPLETED: 0,
  DISPUTE_WINDOW: 0,
  PAID_OUT: 0,
  CANCELLED_WEATHER: 0,
  CANCELLED_BOAT: 0,
  CANCELLED_CREW: 0,
};

export function bookingStateCounts(rows: { state: string }[]): Record<BookingState, number> {
  const counts = { ...ZERO_COUNTS };
  for (const row of rows) {
    if (row.state in counts) counts[row.state as BookingState] += 1;
  }
  return counts;
}

/** SOW 7.iii swap point feeds from this shape; realized = PAID_OUT only. */
export function splitFees(rows: { state: string; feeCents: number }[]): {
  realizedFeeCents: number;
  heldFeeCents: number;
} {
  let realizedFeeCents = 0;
  let heldFeeCents = 0;
  for (const row of rows) {
    if (row.state === "PAID_OUT") realizedFeeCents += row.feeCents;
    else if (HELD_FEE_STATES.has(row.state as BookingState)) heldFeeCents += row.feeCents;
  }
  return { realizedFeeCents, heldFeeCents };
}

export function verifiedProfileCount(rows: { profileId: string }[]): number {
  return new Set(rows.map((r) => r.profileId)).size;
}
