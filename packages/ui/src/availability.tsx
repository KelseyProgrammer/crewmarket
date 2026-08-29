/* 14-day availability window — shared by all three probe directions
   (duration-as-length encoding; see docs/superpowers/plans/2026-08-29-directory-reexecution.md).
   Rule M-2: a date absent from the list is closed, never assumed open. */

export type DayCell = { date: string; open: boolean };

export function availabilityWindow(
  av: { date: string; status: string }[],
  start: string,
  days = 14
): DayCell[] {
  const open = new Set(av.filter((a) => a.status === "OPEN").map((a) => a.date));
  const first = new Date(start + "T00:00:00Z");
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return { date, open: open.has(date) };
  });
}
