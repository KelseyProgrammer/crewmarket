import type { ReactNode } from "react";
import { DisclaimerD2, Container } from "@crewmarket/ui";
import "./globals.css";

// Fonts load via <link> below. If you later want self-hosted fonts (better L2 fluency:
// no FOUT), switch to next/font/google — requires network access at build time.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Archivo:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

export const metadata = {
  title: "Crew Market — Sportfishing Crew Directory & Booking",
  description:
    "Find and book professional sportfishing crew. A marketplace — not an employer or crewing agency.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body>
        <header className="masthead on-navy">
          <Container wide>
            <div className="masthead__row">
              <a className="wordmark" href="/">Crew <b>Market</b></a>
              <nav className="masthead__nav" aria-label="Primary">
                <a href="/directory">Directory</a>
                <a href="/sign-up?role=CREW">List services</a>
                <a href="/sign-up?role=BOAT">Book crew</a>
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
