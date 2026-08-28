/* Shared components (SOW 2.i surfaces, compliance rules noted inline).
   Styling contract: class names resolved by apps/web/app/globals.css using tokens.css vars. */
import type { ReactNode } from "react";

/* ---------- VerifiedSeal — the signature element (rule V-1: visually distinct;
   only rendered when an admin-set credential.verified === true) ---------- */
export function VerifiedSeal({ small = false }: { small?: boolean }) {
  const size = small ? 20 : 28;
  return (
    <span className="seal" title="Credentials verified by Crew Market admin review">
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <circle cx="14" cy="14" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="14" cy="14" r="9.5" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.6 2.2" />
        <path d="M9.4 14.2l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      </svg>
      <span className="seal__label">Verified</span>
    </span>
  );
}

/* ---------- Rule D-2 — mandatory verbatim disclaimer (COMPLIANCE.md).
   Placement: persistent footer (layout), signup, every profile, booking flow. ---------- */
export function DisclaimerD2() {
  return (
    <p className="disclaimer-d2">
      Crew Market is a directory and booking marketplace. We are not an employer, crewing agency, or
      vessel operator. Vessel owners are solely responsible for crew selection, vessel operation, and
      legal compliance including insurance.
    </p>
  );
}

/* ---------- BookingStateBadge (SOW booking flow; CANCELLED_WEATHER first-class) ---------- */
const STATE_LABELS: Record<string, string> = {
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
export function BookingStateBadge({ state }: { state: string }) {
  return <span className={`state-badge state-badge--${state.toLowerCase()}`}>{STATE_LABELS[state] ?? state}</span>;
}

/* ---------- CrewCard — registry plate (see docs/DESIGN.md R1: ≤5 chunks) ---------- */
export type CrewCardData = {
  id: string;
  displayName: string;
  roles: string[];
  homePort: string;
  dayRateUsd: number;
  yearsExperience: number;
  fisheries: string[];
  credentials: { kind: string; licenseClass?: string; expiresAt?: string; verified?: boolean }[];
  availability: { date: string; status: string }[];
  stats: { tripsCompleted: number; avgRating?: number };
};

const ROLE_LABELS: Record<string, string> = {
  MATE: "Mate",
  DECKHAND: "Deckhand",
  CAPTAIN: "Captain",
  SECOND_CAPTAIN: "Second Captain",
  ENGINEER: "Engineer",
  COOK: "Cook",
};

function nextOpenDate(av: CrewCardData["availability"]): string | null {
  const open = av.find((a) => a.status === "OPEN");
  if (!open) return null;
  const d = new Date(open.date + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CrewCard({ crew, index, href }: { crew: CrewCardData; index: number; href?: string }) {
  const verified = crew.credentials.some((c) => c.verified);
  // Rule V-4: captains' license class + expiry legible at a glance
  const license = crew.credentials.find((c) => c.kind.startsWith("USCG") && c.licenseClass);
  const open = nextOpenDate(crew.availability);
  return (
    <article className={`plate${verified ? " plate--verified" : ""}${href ? " plate--linked" : ""}`}>
      <div className="plate__head">
        <span className="eyebrow">REG {String(index + 1).padStart(3, "0")} · {crew.homePort.replace(", FL", "").toUpperCase()}</span>
        {verified && <VerifiedSeal small />}
      </div>
      <h3 className="plate__name">{href ? <a href={href}>{crew.displayName}</a> : crew.displayName}</h3>
      <p className="plate__role">
        {crew.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}
        {license && (
          <span className="plate__license">
            {" "}— {license.licenseClass}
            {license.expiresAt ? `, exp. ${license.expiresAt.slice(0, 7)}` : ""}
            {!license.verified && <em className="plate__selfreported"> (self-reported)</em>}
          </span>
        )}
      </p>
      <dl className="plate__facts">
        <div><dt>Day rate</dt><dd className="mono">${crew.dayRateUsd}</dd></div>
        <div><dt>Experience</dt><dd className="mono">{crew.yearsExperience} yrs</dd></div>
        <div><dt>Next open</dt><dd className="mono">{open ?? "Booked out"}</dd></div>
      </dl>
      <p className="plate__fisheries">{crew.fisheries.join(" · ")}</p>
    </article>
  );
}

export function Container({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? "container container--wide" : "container"}>{children}</div>;
}
