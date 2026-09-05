import { StyleSheet, View } from "react-native";
import { color, radius, space } from "../lib/tokens";
import type { BoardAvailability } from "../lib/board";

/* 14-day availability window — mirrors packages/ui/src/availability.tsx's
   availabilityWindow() (that one renders DOM <div>/<i> and can't run in RN,
   so the pure windowing logic is duplicated here; keep both in lockstep).
   Rule M-2: a date absent from the list is closed, never assumed open. */

const DAYS = 14;

function openDays(av: BoardAvailability[], start: string): boolean[] {
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
}: {
  availability: BoardAvailability[];
  start: string;
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
        <View key={i} style={[styles.cell, open ? styles.cellOpen : styles.cellClosed]} />
      ))}
    </View>
  );
}

const CELL = 7;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.s1 },
  cell: { width: CELL, height: CELL, borderRadius: radius },
  cellOpen: { backgroundColor: color.brass },
  cellClosed: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.lineStrong },
});
