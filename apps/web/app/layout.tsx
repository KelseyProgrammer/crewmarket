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
