import { notFound } from "next/navigation";
import { Container, DisclaimerD2, VerifiedSeal } from "@crewmarket/ui";
import seed from "../../../data/seed-crew.json";
import { credentialsForProfile } from "../../../lib/credential-overrides";

/* Crew profile — the registry plate, unfolded (SOW 2.i Directory & Search).
   Rule D-2: disclaimer renders on every profile (explicit placement, not just footer).
   Rule V-1: verified vs self-reported credentials visually distinct.
   Rule V-4: license class + expiry legible at a glance.
   Rule M-2: rates are crew-set; the copy says so.
   Booking is honest about build state: the request affordance names the phase it arrives with. */

type Credential = { kind: string; licenseClass?: string; expiresAt?: string; verified?: boolean };
type Profile = {
  id: string;
  displayName: string;
  roles: string[];
  homePort: string;
  regions: string[];
  yearsExperience: number;
  fisheries: string[];
  vesselExperience: string[];
  dayRateUsd: number;
  halfDayRateUsd?: number;
  tournamentRateUsd?: number;
  bio: string;
  credentials: Credential[];
  availability: { date: string; status: string }[];
  stats: { tripsCompleted: number };
};

const profiles = seed.profiles as unknown as Profile[];

const ROLE_LABELS: Record<string, string> = {
  MATE: "Mate",
  DECKHAND: "Deckhand",
  CAPTAIN: "Captain",
  SECOND_CAPTAIN: "Second Captain",
  ENGINEER: "Engineer",
  COOK: "Cook",
  STEWARDESS: "Stewardess",
};

const CREDENTIAL_LABELS: Record<string, string> = {
  USCG_OUPV: "USCG OUPV (6-pack)",
  USCG_MASTER_25_50_100: "USCG Master",
  STCW_BASIC: "STCW Basic Training",
  CPR_FIRST_AID: "CPR / First Aid",
  TWIC: "TWIC",
  STATE_CHARTER_LICENSE: "State Charter License",
  OTHER: "Other credential",
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// No generateStaticParams: credentials render from the DB for claimed profiles,
// so this route must server-render per request — static HTML would freeze
// verification state at build time (V-1).

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crew = profiles.find((p) => p.id === id);
  return { title: crew ? `${crew.displayName} — Crew Market Registry` : "Crew Market" };
}

export default async function CrewProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) notFound();
  const crew = profiles[index];

  const dbCredentials = await credentialsForProfile(crew.id);
  const credentials = dbCredentials ?? crew.credentials;
  const verified = credentials.some((c) => c.verified);
  const license = credentials.find((c) => c.kind.startsWith("USCG") && c.licenseClass);
  const openDates = crew.availability.filter((a) => a.status === "OPEN").slice(0, 6);

  return (
    <main className="profile">
      <Container>
        <p className="profile__back"><a href="/directory">← Back to the directory</a></p>

        <header className={`profile__head${verified ? " profile__head--verified" : ""}`}>
          <div className="profile__head-row">
            {/* No ordinals in the board world (M-2/P-4): port furniture only, never a number */}
            <span className="eyebrow">
              {crew.homePort.toUpperCase()} · SYNTHETIC DEMO PROFILE
            </span>
            {verified && <VerifiedSeal />}
          </div>
          <h1 className="profile__name">{crew.displayName}</h1>
          <p className="profile__role">
            {crew.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}
            {license && (
              <span className="plate__license">
                {" "}— {license.licenseClass}
                {license.expiresAt ? `, exp. ${license.expiresAt.slice(0, 7)}` : ""}
                {!license.verified && <em className="plate__selfreported"> (self-reported)</em>}
              </span>
            )}
          </p>
          <p className="profile__bio">{crew.bio}</p>
        </header>

        <section className="profile__panel">
          <span className="eyebrow">RATES · SET BY THE CREW MEMBER</span>
          <dl className="profile__facts">
            <div><dt>Day rate</dt><dd className="mono">${crew.dayRateUsd}</dd></div>
            {crew.halfDayRateUsd && <div><dt>Half-day</dt><dd className="mono">${crew.halfDayRateUsd}</dd></div>}
            {crew.tournamentRateUsd && <div><dt>Tournament day</dt><dd className="mono">${crew.tournamentRateUsd}</dd></div>}
            <div><dt>Experience</dt><dd className="mono">{crew.yearsExperience} yrs</dd></div>
            <div><dt>Trips completed</dt><dd className="mono">{crew.stats.tripsCompleted}</dd></div>
          </dl>
        </section>

        <section className="profile__panel">
          <span className="eyebrow">CREDENTIALS · VERIFIED MEANS ADMIN-REVIEWED DOCUMENTS</span>
          <ul className="profile__credentials">
            {credentials.map((c, i) => (
              <li key={i}>
                <span className="profile__credential-name">
                  {CREDENTIAL_LABELS[c.kind] ?? c.kind}
                  {c.licenseClass ? ` — ${c.licenseClass}` : ""}
                  {c.expiresAt ? `, exp. ${c.expiresAt.slice(0, 7)}` : ""}
                </span>
                {c.verified ? <VerifiedSeal small /> : <em className="plate__selfreported">Self-reported</em>}
              </li>
            ))}
          </ul>
          <p className="profile__note">
            Verification confirms documents exist and match the listed name. It is not a guarantee
            of competence; vessel owners make their own crew decisions.
          </p>
        </section>

        <section className="profile__panel">
          <span className="eyebrow">FISHERIES &amp; VESSELS</span>
          <p className="profile__list">{crew.fisheries.join(" · ")}</p>
          <p className="profile__list profile__list--muted">{crew.vesselExperience.join(" · ")}</p>
          <p className="profile__list profile__list--muted">Works: {crew.regions.join(" · ")}</p>
        </section>

        <section className="profile__panel">
          <span className="eyebrow">NEXT OPEN DATES</span>
          {openDates.length ? (
            <p className="profile__dates mono">{openDates.map((a) => fmtDate(a.date)).join(" · ")}</p>
          ) : (
            <p className="profile__list profile__list--muted">Booked out for the listed window.</p>
          )}
        </section>

        {/* Booking is live: request → crew decides → funds held (simulated until the
            Stripe phase) → trip → 48h review → payout. */}
        <section className="profile__panel profile__panel--booking">
          <span className="eyebrow">BOOKING</span>
          <p className="profile__list">
            Payment is held at booking with the platform fee itemized up front; weather
            cancellation is handled as its own state; payout releases after the trip plus a
            48-hour review window. {crew.displayName.split(" ")[0]} accepts or declines every
            request at their sole discretion. (Demo build: the funds-held step is simulated
            until payments go live.)
          </p>
          <a className="btn btn--brass" href={`/bookings/new?crew=${crew.id}`}>
            Request {crew.displayName.split(" ")[0]} for a trip
          </a>
        </section>

        {/* Rule D-2 — explicit placement on every profile */}
        <div className="profile__disclaimer">
          <DisclaimerD2 />
        </div>
      </Container>
    </main>
  );
}
