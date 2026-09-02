import { redirect } from "next/navigation";
import { Container, BookingStateBadge } from "@crewmarket/ui";
import { fmtUsd, type BookingState } from "@crewmarket/types";
import {
  bookingDates,
  bookingsForUser,
  claimedProfileId,
  crewProfileById,
  fmtTripDates,
  sessionUser,
  voyageNo,
} from "../../lib/bookings";
import { prisma } from "@crewmarket/db";

/* Bookings index (docs/BOOKING_BRIEF.md): registry rows, role-branched.
   No ranks, no urgency — a census of voyages, newest first. */

export const metadata = { title: "Bookings — Crew Market" };

export default async function Bookings() {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/bookings");
  const role = user.accountType === "BOAT" ? "BOAT" : "CREW";

  const bookings = await bookingsForUser(user.id, role);
  const claimed = role === "CREW" ? await claimedProfileId(user.id) : null;

  const boatNames =
    role === "CREW"
      ? new Map(
          (
            await prisma.user.findMany({
              where: { id: { in: [...new Set(bookings.map((b) => b.boatUserId))] } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name])
        )
      : null;

  return (
    <main className="ledger">
      <Container wide>
        <span className="eyebrow">
          {role === "BOAT" ? "YOUR VOYAGES · BOAT" : "YOUR VOYAGES · CREW"} · {bookings.length} ON THE LEDGER
        </span>
        <h1 className="account__name">Bookings</h1>

        {bookings.length === 0 ? (
          <div className="empty">
            {role === "BOAT" ? (
              <>
                <p>No bookings yet. Find crew on the board and send a request from their profile.</p>
                <p><a href="/directory">Browse the crew board</a></p>
              </>
            ) : claimed ? (
              <>
                <p>No requests yet. Boats send requests from your profile on the board.</p>
                <p><a href={`/crew/${claimed}`}>See your public profile</a></p>
              </>
            ) : (
              <>
                <p>
                  Your account isn't linked to a board profile yet — in this demo build, an
                  operator links crew accounts to registry profiles (full crew onboarding is a
                  later phase). Once linked, booking requests land here.
                </p>
                <p><a href="/directory">See the public board</a></p>
              </>
            )}
          </div>
        ) : (
          <div className="ledger__list">
            {bookings.map((b) => {
              const crew = crewProfileById(b.crewProfileId);
              const counterparty =
                role === "BOAT" ? crew?.displayName ?? "Crew" : boatNames?.get(b.boatUserId) ?? "Boat";
              return (
                <a key={b.id} className="ledger__row" href={`/bookings/${b.id}`}>
                  <span className="ledger__row-voyage mono">{voyageNo(b)}</span>
                  <span className="ledger__row-name">{counterparty}</span>
                  <span className="ledger__row-dates mono">{fmtTripDates(bookingDates(b))}</span>
                  <span className="ledger__row-total mono">{fmtUsd(b.rateCents + b.feeCents)}</span>
                  <BookingStateBadge state={b.state as BookingState} />
                </a>
              );
            })}
          </div>
        )}
      </Container>
    </main>
  );
}
