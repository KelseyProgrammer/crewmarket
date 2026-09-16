import "server-only";
import type { Booking } from "@crewmarket/db";
import { fmtUsd, type BookingState } from "@crewmarket/types";
import { crewProfileById, type PartyRole } from "./bookings";

/* Party-safe booking projections (P-4). The BOAT party sees the crew profile's
   registry displayName; the CREW party sees the boat account's user name (resolved
   by the caller and passed in). Neither side ever receives the other's raw identity
   record — only the presentation name and the money the ledger already shows. */

export type BookingSummary = {
  id: string;
  state: BookingState;
  role: PartyRole;
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

// counterparty: BOAT sees crew profile name; CREW sees boat user name (passed in).
export function toBookingSummary(b: Booking, role: PartyRole, boatName: string): BookingSummary {
  const counterpartyName =
    role === "BOAT" ? (crewProfileById(b.crewProfileId)?.displayName ?? "Crew") : boatName;
  return {
    id: b.id,
    state: b.state as BookingState,
    role,
    counterpartyName,
    dates: b.dates as string[],
    totalCents: b.rateCents + b.feeCents,
  };
}

export function toBookingDetail(
  b: Booking,
  role: PartyRole,
  boatName: string,
  availableEvents: string[],
): BookingDetail {
  return {
    ...toBookingSummary(b, role, boatName),
    rateCents: b.rateCents,
    feeCents: b.feeCents,
    tripType: b.tripType,
    requestedAt: b.requestedAt.toISOString(),
    completedAt: b.completedAt?.toISOString() ?? null,
    hasRefund: !!b.stripeRefundId,
    hasPayout: !!b.stripeTransferId,
    availableEvents,
  };
}

export { fmtUsd };
