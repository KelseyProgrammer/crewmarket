import { notFound } from "next/navigation";
import { Container } from "@crewmarket/ui";
import { fmtUsd, type BookingState } from "@crewmarket/types";
import { sessionUser } from "../../../lib/bookings";
import { isAdminEmail } from "../../../lib/credential-rules";
import { computeMetrics } from "../../../lib/admin-metrics";

/* Admin metrics (SOW 2.i): net revenue (simulated until Stripe — SOW 7.iii),
   bookings by state, verification counts. Aggregates only (M-2/P-4).
   Unlinked route, same gate as /admin/credentials. */

// self-documenting defense-in-depth: never statically cached
export const dynamic = "force-dynamic";

export const metadata = { title: "Metrics — Crew Market" };

const STATE_LABELS: Record<BookingState, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  ESCROW_FUNDED: "Funds held",
  IN_PROGRESS: "Under way",
  COMPLETED: "Trip complete",
  DISPUTE_WINDOW: "48h review window",
  PAID_OUT: "Paid out",
  CANCELLED_WEATHER: "Cancelled — weather",
  CANCELLED_BOAT: "Cancelled by boat",
  CANCELLED_CREW: "Cancelled by crew",
};

export default async function AdminMetrics() {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) notFound();

  const m = await computeMetrics();

  return (
    <main className="metrics">
      <Container wide>
        <span className="eyebrow">ADMIN · METRICS</span>
        <h1>Marketplace metrics</h1>

        <div className="metrics__tiles">
          <div className="metrics__tile">
            <span className="eyebrow">NET REVENUE · REALIZED</span>
            <p className="metrics__figure mono">{fmtUsd(m.revenue.realizedFeeCents)}</p>
            {m.revenue.simulated ? (
              <p className="metrics__note">
                Simulated — derived from booking records until Stripe payments go live.
              </p>
            ) : (
              <p className="metrics__note">Derived from Stripe reporting (SOW 7.iii).</p>
            )}
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">FEES ON HELD BOOKINGS</span>
            <p className="metrics__figure mono">{fmtUsd(m.revenue.heldFeeCents)}</p>
            <p className="metrics__note">Funds held or in the 48-hour review window.</p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">BOOKINGS</span>
            <p className="metrics__figure mono">{m.bookings.total}</p>
            <p className="metrics__note">All requests, every state.</p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">VERIFIED CREW PROFILES</span>
            <p className="metrics__figure mono">{m.verification.verifiedProfiles}</p>
            <p className="metrics__note">
              {m.verification.verifiedDocs} document{m.verification.verifiedDocs === 1 ? "" : "s"} reviewed ·{" "}
              {m.verification.awaitingReview} awaiting review
            </p>
          </div>
          <div className="metrics__tile">
            <span className="eyebrow">ACCOUNTS</span>
            <p className="metrics__figure mono">
              {m.accounts.crew} <span className="metrics__unit">crew</span> · {m.accounts.boat}{" "}
              <span className="metrics__unit">boat</span>
            </p>
            <p className="metrics__note">Registered accounts by side.</p>
          </div>
        </div>

        <section className="metrics__states">
          <span className="eyebrow">BOOKINGS BY STATE</span>
          <table className="metrics__table">
            <tbody>
              {(Object.keys(m.bookings.byState) as BookingState[]).map((s) => (
                <tr key={s}>
                  <td>{STATE_LABELS[s]}</td>
                  <td className="mono">{m.bookings.byState[s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </Container>
    </main>
  );
}
