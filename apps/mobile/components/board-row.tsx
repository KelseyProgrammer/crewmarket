import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { color, font, space } from "../lib/tokens";
import type { BoardProfile } from "../lib/board";
import { ROLE_LABELS } from "../lib/roles";
import { AvailabilityStrip } from "./availability-strip";
import { SealRing } from "./engravings";

/* Weigh-in board row (mirrors packages/ui/src/components.tsx CrewCard).
   Probe C guard (M-2/P-4): no rank numbers, no ordinals anywhere — order is
   whatever the filters produced, never a score. Five chunks, per DESIGN.md:
   seal+name · port/roles · license · seasons+rate · availability.

   10/7 polish pass (device-pass verdict: row read as undifferentiated grey):
   names up to the Title Row floor (22), license data moved to mono per the
   Data-Is-Mono rule (verification status stays words-in-italic, V-1), the
   next-open DATE promoted over its label, and pressing a row now inverts it
   to navy — the web board's signature "lights the lane you're on" move —
   with the rate flipping Brass Bright and the strip repainting. */

function fmtNextOpen(iso: string) {
  return new Date(iso + "T00:00:00Z")
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export function BoardRow({
  profile,
  windowStart,
}: {
  profile: BoardProfile;
  windowStart: string;
}) {
  const router = useRouter();
  const verified = profile.credentials.some((c) => c.verified);
  // Rule V-4: license class legible at a glance when a USCG credential carries one.
  const license = profile.credentials.find(
    (c) => c.kind.startsWith("USCG") && c.licenseClass,
  );
  const homePort = profile.homePort.replace(", FL", "");
  const nextOpen = profile.availability
    .filter((a) => a.status === "OPEN" && (!windowStart || a.date >= windowStart))
    .map((a) => a.date)
    .sort()[0];

  const a11yLabel = `${profile.displayName}${verified ? ", verified" : ""}, $${profile.dayRateUsd} per day`;

  return (
    // Not <Link asChild>: its Radix Slot object-spreads the child's style,
    // which silently destroys Pressable's function-form style (padding, gap,
    // pressed state all dropped). router.push keeps the style intact.
    <Pressable
      onPress={() => router.push(`/crew/${profile.id}` as Href)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="link"
      accessibilityLabel={a11yLabel}
    >
      {({ pressed }) => (
        <>
          <View style={styles.headline}>
            <Text style={[styles.name, pressed && styles.namePressed]} numberOfLines={1}>
              {profile.displayName}
            </Text>
            {verified && (
              <View style={styles.seal}>
                <SealRing size={16} stroke={pressed ? color.brassBright : color.brass} />
                <Text style={[styles.sealLabel, pressed && styles.sealLabelPressed]}>
                  VERIFIED
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.meta, pressed && styles.inkOnNavy]}>
            {profile.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}
            <Text style={[styles.metaPort, pressed && styles.mutedOnNavy]}>
              {"   "}
              {homePort.toUpperCase()}
            </Text>
          </Text>
          {/* License is data furniture → Martian Mono (Data-Is-Mono rule);
              V-1: verification status stated in words, in italic — never implied. */}
          {license ? (
            <Text style={[styles.license, pressed && styles.mutedOnNavy]}>
              {(license.licenseClass ?? "").toUpperCase()}
              {license.expiresAt ? ` · EXP ${license.expiresAt.slice(0, 7)}` : ""}
              {"  "}
              <Text style={styles.licenseStatus}>
                {license.verified ? "passed admin review" : "self-reported"}
              </Text>
            </Text>
          ) : (
            <Text style={[styles.noLicense, pressed && styles.mutedOnNavy]}>
              No license listed
            </Text>
          )}
          <View style={styles.footer}>
            <View style={styles.figures}>
              {/* Seasons chunk (DESIGN.md-contracted): mirrors web CrewCard's
                  `{years}<small>seasons</small>` pairing, beside the day rate. */}
              <Text style={[styles.years, pressed && styles.inkOnNavy]}>
                {profile.yearsExperience}
                <Text style={[styles.figureSuffix, pressed && styles.mutedOnNavy]}>
                  {" "}
                  seasons
                </Text>
              </Text>
              <Text style={[styles.rate, pressed && styles.ratePressed]}>
                ${profile.dayRateUsd}
                <Text style={[styles.figureSuffix, pressed && styles.mutedOnNavy]}>
                  {" "}
                  /day · sets own rate
                </Text>
              </Text>
            </View>
            <View style={styles.stripCol}>
              <AvailabilityStrip
                availability={profile.availability}
                start={windowStart}
                inverted={pressed}
              />
              {/* Web chunk-⑤ parity: the strip's next-open microlabel (M-2:
                  absence of a date is closed, "booked out" is the honest floor).
                  The DATE is the datum — it leads in ink; the label recedes. */}
              {nextOpen ? (
                <Text style={[styles.nextOpenLabel, pressed && styles.mutedOnNavy]}>
                  NEXT OPEN{" "}
                  <Text style={[styles.nextOpenDate, pressed && styles.inkOnNavy]}>
                    {fmtNextOpen(nextOpen)}
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.nextOpenLabel, pressed && styles.mutedOnNavy]}>
                  BOOKED OUT
                </Text>
              )}
            </View>
          </View>
        </>
      )}
    </Pressable>
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
  rowPressed: { backgroundColor: color.navyDeep },
  // Inverted-field text inks (web hover spec: text to white, meta to mist).
  inkOnNavy: { color: color.whiteCrisp },
  mutedOnNavy: { color: color.mist },
  headline: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  name: {
    flexShrink: 1,
    fontFamily: font.display,
    fontSize: 22,
    lineHeight: 26,
    includeFontPadding: false,
    color: color.ink,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  namePressed: { color: color.whiteCrisp },
  seal: { flexDirection: "row", alignItems: "center", gap: space.s1 },
  sealLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: color.brassText,
  },
  sealLabelPressed: { color: color.brassBright },
  meta: { fontFamily: font.body, fontSize: 13, color: color.ink },
  metaPort: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    color: color.inkSoft,
  },
  license: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: color.inkSoft,
  },
  licenseStatus: { fontFamily: font.body, fontSize: 12, fontStyle: "italic" },
  noLicense: { fontFamily: font.body, fontSize: 12, fontStyle: "italic", color: color.inkSoft },
  footer: {
    marginTop: space.s2,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    // Figures + 14-day strip don't fit one line on a 390pt phone — the strip
    // wraps to its own line rather than overdrawing the rate text.
    flexWrap: "wrap",
    gap: space.s3,
  },
  figures: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s3,
    flexShrink: 1,
  },
  years: { fontFamily: font.mono, fontSize: 15, color: color.ink },
  rate: {
    fontFamily: font.mono,
    fontSize: 15,
    color: color.ink,
    flexShrink: 1,
  },
  ratePressed: { color: color.brassBright },
  figureSuffix: { fontFamily: font.mono, fontSize: 10, color: color.inkSoft },
  stripCol: { gap: 4, alignItems: "flex-start" },
  nextOpenLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: color.inkSoft,
  },
  nextOpenDate: {
    fontFamily: font.mono,
    fontSize: 12,
    letterSpacing: 0.6,
    color: color.ink,
  },
});
