"use client";

import { useActionState, useState } from "react";
import {
  computeQuote,
  fmtUsd,
  maxDaysFor,
  PLATFORM_FEE_RATE,
  PLATFORM_FEE_SIDE,
  TRIP_TYPE_LABELS,
  type CrewRates,
  type TripType,
} from "@crewmarket/types";
import { createBookingAction, type RequestFormState } from "../actions";

/* Client shell for instant quote preview only — the server action recomputes the
   quote from crew-listed rates at create (R4) and never trusts these numbers. */

type CrewLite = CrewRates & { id: string; displayName: string };

const FEE_PCT = `${Math.round(PLATFORM_FEE_RATE * 100)}%`;

export function RequestForm({
  crew,
  offered,
  boatName,
}: {
  crew: CrewLite;
  offered: TripType[];
  boatName: string;
}) {
  const [tripType, setTripType] = useState<TripType>(offered[0]);
  const [days, setDays] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    createBookingAction,
    {}
  );

  const multi = maxDaysFor(tripType) > 1;
  const effDays = multi ? days : 1;
  const quote = computeQuote(crew, tripType, effDays);

  return (
    <form className="auth__form" action={formAction}>
      <input type="hidden" name="crewProfileId" value={crew.id} />

      <fieldset className="role-fork" style={{ gridTemplateColumns: `repeat(${Math.min(offered.length, 2)}, 1fr)` }}>
        <legend className="field__label">Trip type · only the rates {crew.displayName} lists</legend>
        {offered.map((t) => (
          <label
            key={t}
            className={`role-fork__plate${tripType === t ? " role-fork__plate--active" : ""}`}
          >
            <input
              type="radio"
              name="tripType"
              value={t}
              checked={tripType === t}
              onChange={() => {
                setTripType(t);
                if (maxDaysFor(t) === 1) setDays(1);
              }}
            />
            <span className="role-fork__name">{TRIP_TYPE_LABELS[t]}</span>
          </label>
        ))}
      </fieldset>

      <div className="ledger__daterow">
        <label className="field">
          <span className="field__label">{multi ? "First day" : "Trip date"}</span>
          <input
            type="date"
            name="startDate"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        {multi && (
          <label className="field">
            <span className="field__label">Days (consecutive, max {maxDaysFor(tripType)})</span>
            <input
              type="number"
              name="days"
              min={1}
              max={maxDaysFor(tripType)}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {/* The money block: same numbers from here onward (R4); fee itemized (P-3). */}
      <div className="heldfunds" aria-live="polite">
        <span className="field__label">The numbers · rate set by the crew member</span>
        {quote ? (
          <dl className="heldfunds__lines">
            <div>
              <dt>
                {crew.displayName} — {TRIP_TYPE_LABELS[tripType].toLowerCase()}
                {effDays > 1 ? ` × ${effDays} days` : ""}
              </dt>
              <dd className="mono">{fmtUsd(quote.rateCents)}</dd>
            </div>
            <div>
              <dt>Platform fee ({FEE_PCT}, {PLATFORM_FEE_SIDE === "BOAT" ? "paid by the boat" : "deducted from crew payout"})</dt>
              <dd className="mono">{fmtUsd(quote.feeCents)}</dd>
            </div>
            <div className="heldfunds__total">
              <dt>Held at booking, released after the trip + 48h review</dt>
              <dd className="mono">{fmtUsd(quote.totalCents)}</dd>
            </div>
          </dl>
        ) : (
          <p className="field__hint">Pick a valid number of days to see the numbers.</p>
        )}
      </div>

      {/* Rule D-4: insurance attestation is the boat's, recorded at booking. */}
      <label className="auth__disclaimer">
        <input type="checkbox" name="piAttested" required />
        <span>
          I confirm this vessel carries P&amp;I (protection &amp; indemnity) coverage for this trip.
          Vessel owners are solely responsible for insurance and crew selection.
        </span>
      </label>

      <p className="field__hint">
        This request forms a booking agreement between <b>{boatName}</b> and{" "}
        <b>{crew.displayName}</b>. Crew Market keeps the ledger and holds the funds; it is not
        a party to the agreement. Cancellation and refund terms are stated in the agreement.
      </p>

      {state.error && (
        <p className="auth__error">
          <span className="auth__error-label">Not sent</span>
          {state.error}
        </p>
      )}

      <button className="btn btn--brass auth__submit" type="submit" disabled={pending || !quote}>
        {pending
          ? "Sending request…"
          : quote && startDate
            ? `Send request — ${fmtUsd(quote.totalCents)} held at booking`
            : "Send request"}
      </button>
      <p className="field__hint">
        {crew.displayName.split(" ")[0]} can accept or decline freely — declining never costs
        crew anything on Crew Market.
      </p>
    </form>
  );
}
