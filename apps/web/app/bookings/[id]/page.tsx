import { notFound, redirect } from "next/navigation";
import { Container, DisclaimerD2, BookingStateBadge } from "@crewmarket/ui";
import { prisma } from "@crewmarket/db";
import { fmtUsd, TRIP_TYPE_LABELS, type BookingState } from "@crewmarket/types";
import {
  bookingDates,
  crewProfileById,
  fmtDateTime,
  fmtTripDates,
  partyRoleFor,
  payoutReleaseAt,
  sessionUser,
  tripTypeOf,
  voyageNo,
  withElapsedWindow,
  type PartyRole,
} from "../../../lib/bookings";
import { bookingEventAction } from "../actions";

/* The Voyage Ledger (docs/BOOKING_BRIEF.md): one canonical booking document,
   identical for both parties. One current state, one brass action per role (R1/R5);
   held funds are a visible object with the computed release date (R2/R4);
   cancellations are information, never alarm (R3). Only the two parties load it. */

export const metadata = { title: "Voyage ledger — Crew Market" };

const TRAIL: { key: string; label: string; states: BookingState[] }[] = [
  { key: "requested", label: "Requested", states: ["REQUESTED"] },
  { key: "accepted", label: "Accepted", states: ["ACCEPTED"] },
  { key: "funds", label: "Funds held", states: ["ESCROW_FUNDED"] },
  { key: "underway", label: "Underway", states: ["IN_PROGRESS"] },
  { key: "review", label: "48-hour review", states: ["COMPLETED", "DISPUTE_WINDOW"] },
  { key: "paid", label: "Paid out", states: ["PAID_OUT"] },
];

const CANCEL_INFO: Partial<Record<BookingState, { title: string; body: string }>> = {
  CANCELLED_WEATHER: {
    title: "Cancelled — weather",
    body: "Blown out. Weather cancellation is its own outcome on Crew Market; any refund follows the booking agreement between the parties.",
  },
  CANCELLED_BOAT: {
    title: "Cancelled by the boat",
    body: "The boat withdrew this booking. Any refund follows the booking agreement between the parties.",
  },
  CANCELLED_CREW: {
    title: "Declined / cancelled by the crew member",
    body: "Crew accept or decline at their sole discretion — declining never costs crew anything on Crew Market.",
  },
};

function trailIndex(state: BookingState): number {
  const i = TRAIL.findIndex((s) => s.states.includes(state));
  if (i >= 0) return i;
  return state === "PAID_OUT" ? TRAIL.length - 1 : -1; // cancels handled separately
}

export default async function VoyageLedger({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/${id}`);

  let booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) notFound();
  const role = await partyRoleFor(booking, user.id);
  if (!role) notFound(); // not a party — the ledger does not exist for you
  booking = await withElapsedWindow(booking);

  const crew = crewProfileById(booking.crewProfileId);
  const boat = await prisma.user.findUnique({ where: { id: booking.boatUserId } });
  if (!crew || !boat) notFound();

  const state = booking.state as BookingState;
  const cancelled = CANCEL_INFO[state];
  const lit = cancelled ? -1 : trailIndex(state);
  const dates = bookingDates(booking);
  const totalCents = booking.rateCents + booking.feeCents;
  const releaseAt = booking.completedAt ? payoutReleaseAt(booking.completedAt) : null;

  const stepTime: Record<string, Date | null> = {
    requested: booking.requestedAt,
    accepted: booking.acceptedAt,
    funds: booking.fundsHeldAt,
    underway: booking.tripStartedAt,
    review: booking.completedAt,
    paid: state === "PAID_OUT" ? booking.closedAt : null,
  };

  return (
    <main className="ledger">
      <Container>
        <p className="profile__back"><a href="/bookings">← All bookings</a></p>

        <article className="ledger__doc">
          <header className="ledger__head">
            <span className="eyebrow">
              {voyageNo(booking)} · {fmtTripDates(dates).toUpperCase()} · {crew.homePort.replace(", FL", "").toUpperCase()}
            </span>
            <BookingStateBadge state={state} />
          </header>

          {/* The two named parties; the platform is visibly the ledger-keeper, not one of them (M-4). */}
          <div className="ledger__parties">
            <div>
              <span className="field__label">Boat</span>
              <p className="ledger__party-name">{boat.name}</p>
            </div>
            <div>
              <span className="field__label">Crew · sets own rates</span>
              <p className="ledger__party-name">
                <a href={`/crew/${crew.id}`}>{crew.displayName}</a>
              </p>
            </div>
          </div>
          <p className="ledger__keeper">
            CREW MARKET KEEPS THIS LEDGER AND HOLDS THE FUNDS · IT IS NOT A PARTY TO THE AGREEMENT
          </p>

          {/* Money block — the same numbers as the request screen (R4), fee itemized (P-3). */}
          <div className="heldfunds">
            <span className="field__label">
              {TRIP_TYPE_LABELS[tripTypeOf(booking)]} · {fmtTripDates(dates)}
            </span>
            <dl className="heldfunds__lines">
              <div>
                <dt>Crew rate — set by {crew.displayName}</dt>
                <dd className="mono">{fmtUsd(booking.rateCents)}</dd>
              </div>
              <div>
                <dt>Platform fee, itemized</dt>
                <dd className="mono">{fmtUsd(booking.feeCents)}</dd>
              </div>
              <div className="heldfunds__total">
                <dt>
                  {state === "REQUESTED" || state === "ACCEPTED"
                    ? "To be held at booking"
                    : cancelled
                      ? "Was held"
                      : state === "PAID_OUT"
                        ? "Paid out to crew (fee retained)"
                        : "Held by Crew Market"}
                </dt>
                <dd className="mono">{fmtUsd(totalCents)}</dd>
              </div>
            </dl>
            {releaseAt && state === "DISPUTE_WINDOW" && (
              <p className="heldfunds__release mono">
                PAYOUT RELEASES {fmtDateTime(releaseAt).toUpperCase()} · 48-HOUR REVIEW WINDOW
              </p>
            )}
            {state === "PAID_OUT" && booking.closedAt && (
              <p className="heldfunds__release mono">
                RELEASED {fmtDateTime(booking.closedAt).toUpperCase()}
              </p>
            )}
          </div>

          {/* The trail — exactly one lit step (R1). */}
          {!cancelled && (
            <ol className="trail-rail">
              {TRAIL.map((step, i) => (
                <li
                  key={step.key}
                  className={`trail-rail__step${i < lit ? " trail-rail__step--past" : ""}${i === lit ? " trail-rail__step--lit" : ""}`}
                  aria-current={i === lit ? "step" : undefined}
                >
                  <span className="trail-rail__label">{step.label}</span>
                  {i <= lit && stepTime[step.key] && (
                    <span className="trail-rail__time mono">{fmtDateTime(stepTime[step.key]!)}</span>
                  )}
                  {step.key === "review" && i === lit && releaseAt && (
                    <span className="trail-rail__time mono">releases {fmtDateTime(releaseAt)}</span>
                  )}
                </li>
              ))}
            </ol>
          )}

          {/* Terminal cancellation panel — information, never alarm (R3, G-1). */}
          {cancelled && (
            <div className={`ledger__closed${state === "CANCELLED_WEATHER" ? " ledger__closed--weather" : ""}`}>
              <h2>{cancelled.title}</h2>
              <p>{cancelled.body}</p>
              {booking.closedAt && (
                <p className="mono ledger__closed-time">CLOSED {fmtDateTime(booking.closedAt).toUpperCase()}</p>
              )}
            </div>
          )}

          {/* Action slot — one brass action per role per state (R5). */}
          <ActionSlot bookingId={booking.id} state={state} role={role} totalCents={totalCents} dates={dates} />
        </article>

        {/* Rule D-2 — explicit placement in the booking flow */}
        <div className="ledger__disclaimer">
          <DisclaimerD2 />
        </div>
      </Container>
    </main>
  );
}

function Event({
  bookingId,
  event,
  label,
  brass = false,
  demo = false,
}: {
  bookingId: string;
  event: Parameters<typeof bookingEventAction>[1];
  label: string;
  brass?: boolean;
  demo?: boolean;
}) {
  const action = bookingEventAction.bind(null, bookingId, event);
  return (
    <form action={action} className="ledger__action-form">
      {demo && <span className="ledger__demo-tag mono">DEV · SIMULATED — STRIPE PAYMENTINTENT LANDS HERE</span>}
      <button className={`btn ${brass ? "btn--brass" : "btn--ghost-ink"}`} type="submit">
        {label}
      </button>
    </form>
  );
}

function ActionSlot({
  bookingId,
  state,
  role,
  totalCents,
  dates,
}: {
  bookingId: string;
  state: BookingState;
  role: PartyRole;
  totalCents: number;
  dates: string[];
}) {
  const when = fmtTripDates(dates);
  const rows: React.ReactNode[] = [];

  if (state === "REQUESTED" && role === "CREW") {
    rows.push(
      <Event key="a" bookingId={bookingId} event="CREW_ACCEPT" label={`Accept — ${when} · ${fmtUsd(totalCents)} held for you`} brass />,
      <Event key="d" bookingId={bookingId} event="CREW_DECLINE" label="Decline" />
    );
  }
  if (state === "REQUESTED" && role === "BOAT") {
    rows.push(<Event key="w" bookingId={bookingId} event="CANCEL_BOAT" label="Withdraw request" />);
  }
  if (state === "ACCEPTED") {
    if (role === "BOAT") {
      rows.push(
        <Event key="f" bookingId={bookingId} event="ESCROW_CONFIRMED" label={`Hold funds — ${fmtUsd(totalCents)}`} brass demo />,
        <Event key="cb" bookingId={bookingId} event="CANCEL_BOAT" label="Cancel booking" />
      );
    } else {
      rows.push(<Event key="cc" bookingId={bookingId} event="CANCEL_CREW" label="Cancel booking" />);
    }
    rows.push(<Event key="cw" bookingId={bookingId} event="CANCEL_WEATHER" label="Cancel — weather" />);
  }
  if (state === "ESCROW_FUNDED") {
    // An attestation either party may record — no supervision features (M-3).
    rows.push(
      <Event key="s" bookingId={bookingId} event="TRIP_START" label={`Record trip start — ${when}`} brass />,
      role === "BOAT" ? (
        <Event key="cb" bookingId={bookingId} event="CANCEL_BOAT" label="Cancel booking" />
      ) : (
        <Event key="cc" bookingId={bookingId} event="CANCEL_CREW" label="Cancel booking" />
      ),
      <Event key="cw" bookingId={bookingId} event="CANCEL_WEATHER" label="Cancel — weather" />
    );
  }
  if (state === "IN_PROGRESS") {
    rows.push(
      <Event key="c" bookingId={bookingId} event="TRIP_COMPLETE" label="Record trip complete — starts the 48h review" brass />,
      <Event key="cw" bookingId={bookingId} event="CANCEL_WEATHER" label="Cancel — weather" />
    );
  }
  if (state === "DISPUTE_WINDOW") {
    return (
      <p className="ledger__waiting">
        Nothing to do here — the payout releases automatically when the 48-hour review window
        closes. Either party can raise a dispute with Crew Market support before then.
      </p>
    );
  }

  if (rows.length === 0) return null;
  return <div className="ledger__actions">{rows}</div>;
}
