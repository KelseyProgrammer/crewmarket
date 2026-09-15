/** Cancellation refund tiers (G-1): v1 placeholders — real tiers are attorney+client
    input. Code only ever reads this config; nothing else hardcodes percentages. */

export const CANCEL_STATES = ["CANCELLED_WEATHER", "CANCELLED_BOAT", "CANCELLED_CREW"] as const;
export type CancelState = (typeof CANCEL_STATES)[number];

export const REFUND_TIERS: Record<CancelState, number> = {
  CANCELLED_WEATHER: 1.0,
  CANCELLED_BOAT: 1.0,
  CANCELLED_CREW: 1.0,
};

export function isCancelState(state: string): state is CancelState {
  return (CANCEL_STATES as readonly string[]).includes(state);
}

/** Whole cents, clamped to [0, totalCents]. */
export function refundCentsFor(target: CancelState, totalCents: number): number {
  const cents = Math.round(totalCents * REFUND_TIERS[target]);
  return Math.max(0, Math.min(totalCents, cents));
}
