import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link, type Href } from "expo-router";
import { color, font, space } from "../lib/tokens";
import type { BoardProfile } from "../lib/board";
import { ROLE_LABELS } from "../lib/roles";
import { AvailabilityStrip } from "./availability-strip";

/* Weigh-in board row (mirrors packages/ui/src/components.tsx CrewCard).
   Probe C guard (M-2/P-4): no rank numbers, no ordinals anywhere — order is
   whatever the filters produced, never a score. */

export function BoardRow({ profile, windowStart }: { profile: BoardProfile; windowStart: string }) {
  const verified = profile.credentials.some((c) => c.verified);
  // Rule V-4: license class legible at a glance when a USCG credential carries one.
  const license = profile.credentials.find((c) => c.kind.startsWith("USCG") && c.licenseClass);
  const homePort = profile.homePort.replace(", FL", "");

  return (
    <Link href={`/crew/${profile.id}` as Href} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.headline}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.displayName}
          </Text>
          {verified && (
            <View style={styles.seal}>
              <View style={styles.sealDot} />
              <Text style={styles.sealLabel}>VERIFIED</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          {profile.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")} · {homePort}
        </Text>
        <Text style={styles.license}>
          {license
            ? `${license.licenseClass}${license.verified ? " · passed admin review" : " · self-reported"}`
            : "No license listed"}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.rate}>
            ${profile.dayRateUsd}
            <Text style={styles.rateSuffix}>/day · sets own rate</Text>
          </Text>
          <AvailabilityStrip availability={profile.availability} start={windowStart} />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: color.whiteCrisp,
    borderBottomWidth: 1,
    borderBottomColor: color.lineOnWhite,
    paddingVertical: space.s4,
    paddingHorizontal: space.s4,
    gap: space.s1,
  },
  rowPressed: { backgroundColor: color.boardBg },
  headline: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  name: {
    flexShrink: 1,
    fontFamily: font.display,
    fontSize: 18,
    color: color.ink,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  seal: { flexDirection: "row", alignItems: "center", gap: space.s1 },
  sealDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.brass,
    borderWidth: 1,
    borderColor: color.brassText,
  },
  sealLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: color.brassText,
  },
  meta: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  license: { fontFamily: font.body, fontSize: 12, color: color.inkSoft },
  footer: {
    marginTop: space.s2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s3,
  },
  rate: { fontFamily: font.mono, fontSize: 15, color: color.ink },
  rateSuffix: { fontFamily: font.mono, fontSize: 10, color: color.inkSoft },
});
