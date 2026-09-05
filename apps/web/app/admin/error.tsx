"use client";

/* Minimal boundary for admin pages: a metrics/review page opened during an
   incident should degrade to a plain message, not the framework crash page.
   Error boundaries must never render the error message itself — nothing
   sensitive leaks (P-4). */

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="admincreds">
      <div className="adminerror">
        <span className="eyebrow">ADMIN</span>
        <h1>Data unavailable</h1>
        <p>This page couldn&apos;t load its data. Check the database connection, then retry.</p>
        <button className="btn btn--ghost-ink" onClick={() => reset()}>Retry</button>
      </div>
    </main>
  );
}
