import { Container } from "@crewmarket/ui";

/* Landing — see docs/DESIGN.md.
   L1: institutional first glance (chart field, engraved serif).
   L4: immediate fork into the two real intents; concrete verbs; escrow *shown* as the trail. */
export default function Home() {
  return (
    <main>
      <section className="hero on-navy">
        <Container wide>
          <span className="eyebrow eyebrow--on-navy">24.9° N · 80.6° W — SOUTH FLORIDA FISHERY</span>
          <h1 className="hero__title">
            Professional crew, <em>on the registry.</em>
          </h1>
          <p className="hero__sub">
            Mates, deckhands, and licensed captains list their services and set their own rates.
            Boats book them with payment held until the trip is done. Credentials are
            admin-verified; weather cancellations are a first-class part of every booking.
          </p>
          <div className="hero__fork">
            <a className="btn btn--brass" href="/directory">Browse the directory</a>
            <a className="btn btn--ghost-navy" href="/sign-up?role=CREW">List my services</a>
          </div>
        </Container>
      </section>

      <section className="trail">
        <Container wide>
          <span className="eyebrow">HOW A BOOKING RUNS</span>
          <h2>Funds held. Trip run. Payout released.</h2>
          <div className="trail__steps">
            <div className="trail__step">
              <span className="eyebrow">REQUEST</span>
              <h3>Boat requests, crew decides</h3>
              <p>Crew accept or decline any booking at their sole discretion — no penalties, ever.</p>
            </div>
            <div className="trail__step trail__step--seal">
              <span className="eyebrow">FUNDS HELD</span>
              <h3>Payment held at booking</h3>
              <p>The agreed rate and an itemized platform fee are held — nothing changes hands at the dock.</p>
            </div>
            <div className="trail__step">
              <span className="eyebrow">TRIP</span>
              <h3>Weather counts</h3>
              <p>Blown out? Weather cancellation is its own booking state with its own refund handling.</p>
            </div>
            <div className="trail__step">
              <span className="eyebrow">PAYOUT</span>
              <h3>Released after 48 hours</h3>
              <p>After the trip completes and a 48-hour review window passes, the payout releases to crew.</p>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
