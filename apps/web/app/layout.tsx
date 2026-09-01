import type { ReactNode } from "react";
import { Oswald, Archivo, Martian_Mono } from "next/font/google";
import { DisclaimerD2, Container } from "@crewmarket/ui";
import "./globals.css";

// Self-hosted at build via next/font (no FOUT). tokens.css resolves the --next-font-* vars.
const display = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--next-font-display" });
const body = Archivo({ subsets: ["latin"], weight: ["400", "600"], variable: "--next-font-body" });
const mono = Martian_Mono({ subsets: ["latin"], weight: "400", variable: "--next-font-mono" });

export const metadata = {
  title: "Crew Market — Sportfishing Crew Directory & Booking",
  description:
    "Find and book professional sportfishing crew. A marketplace — not an employer or crewing agency.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {/* eslint-disable-next-line react/no-danger -- direction contract must survive the production build as a real HTML comment */}
        <script
          type="text/x-direction-contract"
          dangerouslySetInnerHTML={{
            __html: `
THESIS: tournament weigh-in board — the directory is one monumental board of full-width rows, not a card grid; it refuses the marketplace card-shelf default.
OWN-WORLD: navy #0a1d30 field / white rows on #f6f7f8 ground; brass only for verification + primary action; Oswald condensed caps as matter, Archivo body, Martian Mono data; 2px radius; row hover inverts to navy.
STORY: a boat owner scans the board like a dockside leaderboard-that-isn't — no ranks anywhere (M-2/P-4); order is their filter, never a score. Brass seal = credentials passed admin review.
FIRST VIEWPORT: navy banner with THE CREW BOARD at clamp(40-84px), filters bar, boardhead labels, first rows with 14-day brass availability strips.
FORM: probe C (challenger), concept-seed cc54bbda index 6, artifact caf986f4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
`,
          }}
        />
        <header className="masthead on-navy">
          <Container wide>
            <div className="masthead__row">
              <a className="wordmark" href="/">Crew <b>Market</b></a>
              <nav className="masthead__nav" aria-label="Primary">
                <a href="/directory">Directory</a>
                <a href="/sign-up?role=CREW">List services</a>
                <a href="/sign-up?role=BOAT">Book crew</a>
                <a href="/account">Account</a>
              </nav>
            </div>
          </Container>
        </header>
        {children}
        <footer className="footer on-navy">
          <Container wide>
            {/* Rule D-2 — persistent on every page */}
            <DisclaimerD2 />
            <p className="footer__legal">© 2026 CREW MARKET · SOUTH FLORIDA FISHERY · SYNTHETIC DEMO DATA</p>
          </Container>
        </footer>
      </body>
    </html>
  );
}
