import type { ReactNode } from "react";
export const metadata = {
  title: "Crew Market — Sportfishing Crew Directory & Booking",
  description: "Find and book professional sportfishing crew. A marketplace — not an employer or crewing agency.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en"><body>
      {children}
      <footer>{/* Disclaimer D-2 — persistent on every page */}</footer>
    </body></html>
  );
}
