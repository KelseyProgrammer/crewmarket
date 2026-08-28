import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Container } from "@crewmarket/ui";
import { auth } from "../../lib/auth";
import { SignOutButton } from "../../components/sign-out-button";

/* Role-based account shell (SOW 2.i: role-based views/permissions).
   Real session check happens here; middleware only does the optimistic cookie gate.
   Copy stays honest about build state: live actions link out, unbuilt phases are
   named as upcoming, nothing is faked. */

export const metadata = { title: "Account — Crew Market" };

const SHELLS = {
  CREW: {
    eyebrow: "ACCOUNT · CREW",
    heading: "Your registry account is open.",
    lede:
      "Your listing isn't on the public registry yet — profile setup is the next build phase. " +
      "You set your own rates and accept or decline bookings at your sole discretion.",
    liveAction: { href: "/directory", label: "See the public directory" },
    upcoming: [
      ["LISTING", "Profile & services listing — roles, rates you set, availability, home port"],
      ["PAYOUTS", "Payout onboarding via Stripe Connect — Stripe handles identity and bank details"],
      ["CREDENTIALS", "Credential upload for admin review — the brass seal is earned, never self-set"],
    ],
  },
  BOAT: {
    eyebrow: "ACCOUNT · BOAT",
    heading: "Your account is open — the directory is live.",
    lede:
      "Browse independent crew now. Booking requests, held payment, and the 48-hour review " +
      "window arrive with the booking phase.",
    liveAction: { href: "/directory", label: "Browse the crew directory" },
    upcoming: [
      ["BOOKING", "Request crew for specific dates — crew are free to accept or decline"],
      ["FUNDS HELD", "Payment held at booking with the platform fee itemized"],
      ["INSURANCE", "P&I coverage attestation, recorded at booking"],
    ],
  },
} as const;

export default async function Account() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?from=/account");

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
