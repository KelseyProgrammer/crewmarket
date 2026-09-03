import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { Container, DisclaimerD2 } from "@crewmarket/ui";
import { tripTypesFor } from "@crewmarket/types";
import { crewProfileById, sessionUser } from "../../../lib/bookings";
import { RequestForm } from "./request-form";

/* Booking request (docs/BOOKING_BRIEF.md R1): one screen, one action. The money
   block derives mechanically from crew-listed rates (M-2) with the platform fee
   itemized before anything is sent (P-3/R4 — no new numbers at funding). */

export const metadata = { title: "Request a booking — Crew Market" };

export default async function NewBooking({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string }>;
}) {
  const { crew: crewId = "" } = await searchParams;
  const crew = crewProfileById(crewId);
  if (!crew) notFound();

  const user = await sessionUser();
  if (!user) redirect(`/sign-in?from=/bookings/new?crew=${crewId}`);

  if (user.accountType !== "BOAT") {
    // Wrong-role guard, stated plainly — no dead ends, no scolding.
    return (
      <main className="auth">
        <Container>
          <div className="auth__panel">
            <span className="eyebrow">BOOKING · BOAT ACCOUNTS</span>
            <h1 className="auth__title">Booking is the boat side</h1>
            <p className="auth__lede">
              You&apos;re signed in with a crew account. Boat owners and captains send booking
              requests; crew accept or decline them from their own bookings page.
            </p>
            <Link className="btn btn--brass" href="/bookings">Go to your bookings</Link>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className="auth">
      <Container>
        <div className="auth__panel auth__panel--wide">
          <span className="eyebrow">BOOKING REQUEST · {crew.homePort.replace(", FL", "").toUpperCase()}</span>
          <h1 className="auth__title">Book {crew.displayName}</h1>
          <p className="auth__lede">
            {crew.roles.join(" · ").toLowerCase().replace(/_/g, " ")} · rates set by the crew
            member. They accept or decline at their sole discretion.
          </p>
          <RequestForm
            crew={{
              id: crew.id,
              displayName: crew.displayName,
              dayRateUsd: crew.dayRateUsd,
              halfDayRateUsd: crew.halfDayRateUsd,
              tournamentRateUsd: crew.tournamentRateUsd,
            }}
            offered={tripTypesFor(crew)}
            boatName={user.name ?? "Your boat account"}
          />
          {/* Rule D-2 — explicit placement in the booking flow (last contractual placement) */}
          <div className="ledger__disclaimer">
            <DisclaimerD2 />
          </div>
        </div>
      </Container>
    </main>
  );
}
