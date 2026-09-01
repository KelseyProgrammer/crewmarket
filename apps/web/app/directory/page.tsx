import { Container, CrewCard, type CrewCardData } from "@crewmarket/ui";
import seed from "../../data/seed-crew.json";

/* Directory & Search (SOW 2.i): listing page + filters {role, port, availability date, verified-only}.
   Server-rendered GET form: zero client JS, shareable filter URLs, works on a dock connection.
   L0 (docs/DESIGN.md R1): exactly the four contracted filters, five chunks per plate. */

const ROLE_OPTIONS = [
  ["", "Any role"],
  ["CAPTAIN", "Captain"],
  ["SECOND_CAPTAIN", "Second Captain"],
  ["MATE", "Mate"],
  ["DECKHAND", "Deckhand"],
  ["ENGINEER", "Engineer"],
  ["COOK", "Cook"],
] as const;

type Search = { role?: string; port?: string; date?: string; verified?: string };

export const metadata = { title: "Crew Directory — Crew Market" };

export default async function Directory({ searchParams }: { searchParams: Promise<Search> }) {
  const { role = "", port = "", date = "", verified = "" } = await searchParams;
  const all = seed.profiles as unknown as CrewCardData[];
  const ports = [...new Set(all.map((c) => c.homePort))].sort();
  // Strip window start: earliest seeded availability date — deterministic, no new Date().
  // Profiles whose window opens later render leading days closed (M-2: absence is closed).
  const windowStart = all.flatMap((c) => c.availability.map((a) => a.date)).sort()[0];

  const results = all.filter((c) => {
    if (role && !c.roles.includes(role)) return false;
    if (port && c.homePort !== port) return false;
    if (date && !c.availability.some((a) => a.date === date && a.status === "OPEN")) return false;
    if (verified && !c.credentials.some((cr) => cr.verified)) return false;
    return true;
  });

  return (
    <main className="directory">
      <Container wide>
        <span className="eyebrow">CREW REGISTRY · {String(all.length).padStart(3, "0")} LISTED</span>
        <h1>Find crew for your next trip</h1>
        <p className="directory__meta">
          Independent crew list their own services and set their own rates. A brass seal means
          credentials passed admin review; everything else is self-reported.
        </p>

        <form className="filters" method="get" action="/directory">
          <label>
            Role
            <select name="role" defaultValue={role}>
              {ROLE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Home port
            <select name="port" defaultValue={port}>
              <option value="">Any port</option>
              {ports.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Available on
            <input type="date" name="date" defaultValue={date} />
          </label>
          <label className="check">
            <input type="checkbox" name="verified" value="1" defaultChecked={!!verified} />
            Verified only
          </label>
          <button className="btn btn--ghost-ink" type="submit">Apply filters</button>
        </form>

        {results.length === 0 ? (
          <div className="empty">
            <p>No crew match these filters yet — the fishery is deep, the filters are narrow.</p>
            <p><a href="/directory">Clear all filters</a> to see the full registry.</p>
          </div>
        ) : (
          <div className="grid">
            {results.map((c, i) => (
              <CrewCard key={c.id} crew={c} windowStart={windowStart} href={`/crew/${c.id}`} />
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
