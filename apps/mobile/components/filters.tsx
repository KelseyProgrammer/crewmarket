import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { color, font, space, radius } from "../lib/tokens";
import type { BoardFilters, BoardProfile } from "../lib/board";

/* Directory & Search (SOW 2.i): the four contracted filters {role, port,
   availability date, verified-only} as data-native chip rows — the 14-day
   availability window already gives us discrete dates, so chips beat a
   datepicker dependency (see plan). Selected chip inverts to navy. */

// Copied verbatim from apps/web/app/directory/page.tsx ROLE_OPTIONS.
const ROLE_OPTIONS: readonly [string, string][] = [
  ["", "Any role"],
  ["CAPTAIN", "Captain"],
  ["SECOND_CAPTAIN", "Second Captain"],
  ["MATE", "Mate"],
  ["DECKHAND", "Deckhand"],
  ["ENGINEER", "Engineer"],
  ["COOK", "Cook"],
  ["STEWARDESS", "Stewardess"],
];

function dateChips(windowStart: string | undefined, days = 14): { value: string; label: string }[] {
  if (!windowStart) return [];
  const first = new Date(windowStart + "T00:00:00Z");
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return { value, label };
  });
}

function Chip({
  label,
  active,
  onPress,
  sealDot,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  sealDot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {/* Brass dot on the verified-only chip: brass meaning "verification"
          (Brass Ledger) — Brass Bright on the inverted navy chip. */}
      {sealDot && <View style={[styles.chipDot, active && styles.chipDotActive]} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Filters({
  profiles,
  windowStart,
  value,
  onChange,
}: {
  profiles: BoardProfile[];
  windowStart: string | undefined;
  value: BoardFilters;
  onChange: (next: BoardFilters) => void;
}) {
  const ports = useMemo(() => [...new Set(profiles.map((p) => p.homePort))].sort(), [profiles]);
  const dates = useMemo(() => dateChips(windowStart), [windowStart]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Role</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {ROLE_OPTIONS.map(([v, l]) => (
          <Chip key={v || "any"} label={l} active={value.role === v} onPress={() => onChange({ ...value, role: v })} />
        ))}
      </ScrollView>

      <Text style={styles.label}>Home port</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Any port" active={value.port === ""} onPress={() => onChange({ ...value, port: "" })} />
        {ports.map((p) => (
          <Chip key={p} label={p} active={value.port === p} onPress={() => onChange({ ...value, port: p })} />
        ))}
      </ScrollView>

      <Text style={styles.label}>Available on</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Any date" active={value.date === ""} onPress={() => onChange({ ...value, date: "" })} />
        {dates.map((d) => (
          <Chip key={d.value} label={d.label} active={value.date === d.value} onPress={() => onChange({ ...value, date: d.value })} />
        ))}
      </ScrollView>

      <View style={styles.chipRow}>
        <Chip
          label="Verified only"
          active={value.verifiedOnly}
          sealDot
          onPress={() => onChange({ ...value, verifiedOnly: !value.verifiedOnly })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The filters console: a white plate closed by the 2px navy rule, seated on
  // the board with the system's one sanctioned grounding shadow (DESIGN.md
  // "Filters Bar" — ported from the web filters bar, not a new shadow).
  wrap: {
    backgroundColor: color.whiteCrisp,
    paddingTop: space.s4,
    paddingBottom: space.s3,
    gap: space.s2,
    borderBottomWidth: 2,
    borderBottomColor: color.navyDeep,
    marginBottom: space.s3,
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 10,
    shadowOpacity: 0.12,
    elevation: 4,
  },
  // The one display-face label in the system (web filters spec): Oswald caps.
  label: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.3,
    color: color.inkSoft,
    textTransform: "uppercase",
    paddingHorizontal: space.s4,
  },
  chipRow: { flexDirection: "row", gap: space.s2, paddingHorizontal: space.s4, paddingBottom: space.s2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s3,
    minHeight: 44,
    justifyContent: "center",
    // Inputs sit on Board Ground when the plate is white (web filters spec).
    backgroundColor: color.boardBg,
  },
  chipActive: { backgroundColor: color.navyDeep, borderColor: color.navyDeep },
  chipText: { fontFamily: font.body, fontSize: 13, color: color.ink },
  chipTextActive: { color: color.whiteCrisp },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.brass },
  chipDotActive: { backgroundColor: color.brassBright },
});
