// Client mirrors of the party-safe projections the web API returns
// (apps/web/lib/booking-view.ts). Kept in sync by hand — if the web shapes
// change, mirror them here. No raw Stripe ids or counterparty internals cross
// the wire (P-4): only booleans (hasRefund/hasPayout) and display fields.

export type BookingRole = "BOAT" | "CREW";

export type BookingSummary = {
  id: string;
  state: string;
  role: BookingRole;
  counterpartyName: string;
  dates: string[];
  totalCents: number;
};

export type BookingDetail = BookingSummary & {
  rateCents: number;
  feeCents: number;
  tripType: string;
  requestedAt: string;
  completedAt: string | null;
  hasRefund: boolean;
  hasPayout: boolean;
  availableEvents: string[];
};

/** "Sep 12" / "Sep 12–14" — coarse dates only (D-3). Mirrors web fmtTripDates. */
export function fmtTripDates(dates: string[]): string {
  if (!dates || dates.length === 0) return "—";
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dates.length === 1) return fmt(dates[0]);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${fmt(first)}–${new Date(last + "T00:00:00").getDate()}`
    : `${fmt(first)} – ${fmt(last)}`;
}
