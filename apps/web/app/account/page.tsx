import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Container } from "@crewmarket/ui";
import { auth } from "../../lib/auth";
import { SignOutButton } from "../../components/sign-out-button";
import { CredentialsSection } from "./credentials-section";

/* Role-based account shell (SOW 2.i: role-based views/permissions).
   Real session check happens here; middleware only does the optimistic cookie gate.
   Copy stays honest about build state: live actions link out, unbuilt phases are
   named as upcoming, nothing is faked. */

export const metadata = { title: "Account — Crew Market" };

const SHELLS = {
  CREW: {
    eyebrow: "ACCOUNT · CREW",
    heading: "Your account is open — bookings are live.",
    lede:
      "Booking requests land on your bookings page; you accept or decline each one at your " +
      "sole discretion, and declining never costs you anything. Your own board listing is a " +
      "later build phase.",
    liveAction: { href: "/bookings", label: "See your bookings" },
    upcoming: [
      ["LISTING", "Profile & services listing — roles, rates you set, availability, home port"],
      ["PAYOUTS", "Payout onboarding via Stripe Connect — Stripe handles identity and bank details"],
    ],
  },
  BOAT: {
    eyebrow: "ACCOUNT · BOAT",
    heading: "Your account is open — booking is live.",
    lede:
      "Find crew on the board and request them for specific dates. Payment is held at booking " +
      "with the fee itemized; payout releases after the trip plus a 48-hour review window. " +
      "(Demo build: the funds-held step is simulated until payments go live.)",
    liveAction: { href: "/bookings", label: "See your bookings" },
    upcoming: [
      ["PAYMENTS", "Real held payment via Stripe — the simulated step becomes a PaymentIntent"],
      ["INSURANCE", "P&I attestation records move to your boat profile"],
      ["REVIEWS", "Reviews accrue only from completed on-platform bookings"],
    ],
  },
} as const;

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ cred?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?from=/account");
  const { cred } = await searchParams;

  const accountType = session.user.accountType === "BOAT" ? "BOAT" : "CREW";
  const shell = SHELLS[accountType];

  return (
    <main className="account">
      <Container wide>
        <div className="account__head">
          <div>
            <span className="eyebrow">{shell.eyebrow}</span>
            <h1 className="account__name">{session.user.name}</h1>
          </div>
          <SignOutButton />
        </div>

        <div className="account__panel">
          <h2 className="account__status">{shell.heading}</h2>
          <p className="account__lede">{shell.lede}</p>
          <a className="btn btn--brass" href={shell.liveAction.href}>
            {shell.liveAction.label}
          </a>
        </div>

        {accountType === "CREW" ? (
          <CredentialsSection userId={session.user.id} notice={cred === "denied"} />
        ) : null}

        <div className="account__panel account__panel--upcoming">
          <span className="eyebrow">NEXT ON THE BUILD</span>
          <ul className="account__upcoming">
            {shell.upcoming.map(([label, desc]) => (
              <li key={label}>
                <span className="account__upcoming-label">{label}</span>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </main>
  );
}
