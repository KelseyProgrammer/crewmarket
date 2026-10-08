import { StyleSheet, View } from "react-native";
import { color, radius, space } from "../lib/tokens";
import type { BoardAvailability } from "../lib/board";

/* 14-day availability window — mirrors packages/ui/src/availability.tsx's
   availabilityWindow() (that one renders DOM <div>/<i> and can't run in RN,
   so the pure windowing logic is duplicated here; keep both in lockstep).
   Rule M-2: a date absent from the list is closed, never assumed open.
   10/7 polish pass: cells 7→10pt (the 7pt strip was the "hard to read"
   device-pass finding) and an `inverted` variant for the pressed-row navy
   field — open cells brighten to Brass Bright, the web hover-repaint move. */

const DAYS = 14;

function openDays(av: BoardAvailability[], start: string): boolean[] {
  // Empty board / no seeded availability yet: render all-closed cells rather
  // than constructing new Date("T00:00:00Z"), which is invalid.
  if (!start) return Array.from({ length: DAYS }, () => false);
  const open = new Set(av.filter((a) => a.status === "OPEN").map((a) => a.date));
  const first = new Date(start + "T00:00:00Z");
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    return open.has(d.toISOString().slice(0, 10));
  });
}

export function AvailabilityStrip({
  availability,
  start,
  inverted = false,
}: {
  availability: BoardAvailability[];
  start: string;
  /** Pressed-row navy field: open cells Brass Bright, closed hairlines mist. */
  inverted?: boolean;
}) {
  const days = openDays(availability, start);
  const openCount = days.filter(Boolean).length;
  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={`${openCount} of next ${DAYS} days open`}
    >
      {days.map((open, i) => (
        <View
          key={i}
          style={[
            styles.cell,
            open
              ? inverted
                ? styles.cellOpenInverted
                : styles.cellOpen
              : inverted
                ? styles.cellClosedInverted
                : styles.cellClosed,
          ]}
        />
      ))}
    </View>
  );
}

const CELL = 10;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.s1 },
  cell: { width: CELL, height: CELL, borderRadius: radius },
  cellOpen: { backgroundColor: color.brass },
  cellOpenInverted: { backgroundColor: color.brassBright },
  cellClosed: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.lineStrong },
  cellClosedInverted: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.lineOnNavy },
});
