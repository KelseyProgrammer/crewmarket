import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useFonts, Oswald_500Medium, Oswald_700Bold } from "@expo-google-fonts/oswald";
import { Archivo_400Regular, Archivo_600SemiBold } from "@expo-google-fonts/archivo";
import { MartianMono_400Regular } from "@expo-google-fonts/martian-mono";
import { DisclaimerD2 } from "../../../components/disclaimer-d2";
import { ROLE_LABELS } from "../../../lib/roles";
import { API_URL } from "../../../lib/api";
import { cachedBoard, getBoard, type BoardCredential, type BoardProfile } from "../../../lib/board";
import { color, font, space, radius } from "../../../lib/tokens";

/* Crew profile — the registry plate (slice 1, Task 4). Mirrors
   apps/web/app/crew/[id]/page.tsx section-for-section; copy that exists on
   the web is reused verbatim here (D-2, M-2, V-3).

   Cold-start / deep link: the board screen (Task 3) fetches once into a
   module-level cache (lib/board.ts getBoard()/cachedBoard()). If this screen
   is the FIRST thing to mount in the app session (deep link straight to
   /crew/<id>, no prior visit to the board), cachedBoard() is null and we
   fall back to getBoard(), which fetches and populates the same cache. Both
   paths converge on the same in-memory list — there is no separate profile
   endpoint (V-1: board and profile never disagree, because they're the same
   fetch). */

const CREDENTIAL_LABELS: Record<string, string> = {
  USCG_OUPV: "USCG OUPV (6-pack)",
  USCG_MASTER_25_50_100: "USCG Master",
  STCW_BASIC: "STCW Basic Training",
  CPR_FIRST_AID: "CPR / First Aid",
  TWIC: "TWIC",
  STATE_CHARTER_LICENSE: "State Charter License",
  OTHER: "Other credential",
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type LoadState = "loading" | "not-found" | "error" | "ready";

export default function CrewProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [fontsLoaded] = useFonts({
    Oswald_500Medium,
    Oswald_700Bold,
    Archivo_400Regular,
    Archivo_600SemiBold,
    MartianMono_400Regular,
  });

  const [profile, setProfile] = useState<BoardProfile | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    function resolveFrom(all: BoardProfile[]) {
      if (cancelled) return;
      const found = all.find((p) => p.id === id) ?? null;
      setProfile(found);
      setState(found ? "ready" : "not-found");
    }

    const cached = cachedBoard();
    if (cached) {
      resolveFrom(cached);
      return;
    }

    // Cold start / deep link: no board fetch has happened yet this session.
    // (state is already "loading" from useState's initial value; no need to
    // set it again synchronously here — see react-hooks/set-state-in-effect.)
    getBoard()
      .then(resolveFrom)
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const retry = () => {
    setState("loading");
    getBoard()
      .then((all) => {
        const found = all.find((p) => p.id === id) ?? null;
        setProfile(found);
        setState(found ? "ready" : "not-found");
      })
      .catch(() => setState("error"));
  };

  if (!fontsLoaded || state === "loading") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Crew Market" }} />
        <ActivityIndicator color={color.navyDeep} />
        <Text style={styles.centerText}>Loading crew profile…</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Crew Market" }} />
        <Text style={styles.centerText}>Can&apos;t reach the crew board — check your connection.</Text>
        <Pressable style={styles.retry} onPress={retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (state === "not-found" || !profile) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Crew Market" }} />
        <Text style={styles.centerText}>This profile isn&apos;t on the board.</Text>
        <Link href="/" asChild>
          <Pressable>
            <Text style={styles.link}>Back to the crew board</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const verified = profile.credentials.some((c) => c.verified);
  const license = profile.credentials.find((c) => c.kind.startsWith("USCG") && c.licenseClass);
  const openDates = profile.availability.filter((a) => a.status === "OPEN").slice(0, 6);
  const firstName = profile.displayName.split(" ")[0];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: profile.displayName }} />

      <View style={styles.head}>
        <View style={styles.eyebrowRow}>
          {/* No ordinals in the board world (M-2/P-4): port furniture only, never a number */}
          <Text style={styles.eyebrow}>{profile.homePort.toUpperCase()} · SYNTHETIC DEMO PROFILE</Text>
          {verified && (
            <View style={styles.seal}>
              <View style={styles.sealDot} />
              <Text style={styles.sealLabel}>Verified</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.role}>
          {profile.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}
          {license && (
            <Text>
              {" — "}
              {license.licenseClass}
              {license.expiresAt ? `, exp. ${license.expiresAt.slice(0, 7)}` : ""}
              {!license.verified && <Text style={styles.selfReported}> (self-reported)</Text>}
            </Text>
          )}
        </Text>
        <Text style={styles.bio}>{profile.bio}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>RATES · SET BY THE CREW MEMBER</Text>
        <View style={styles.facts}>
          <Fact label="Day rate" value={`$${profile.dayRateUsd}`} />
          {profile.halfDayRateUsd != null && <Fact label="Half-day" value={`$${profile.halfDayRateUsd}`} />}
          {profile.tournamentRateUsd != null && (
            <Fact label="Tournament day" value={`$${profile.tournamentRateUsd}`} />
          )}
          <Fact label="Experience" value={`${profile.yearsExperience} yrs`} />
          <Fact label="Trips completed" value={`${profile.stats.tripsCompleted}`} />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>CREDENTIALS · VERIFIED MEANS ADMIN-REVIEWED DOCUMENTS</Text>
        <View style={styles.credentialList}>
          {profile.credentials.map((c: BoardCredential, i: number) => (
            <View key={i} style={styles.credentialRow}>
              <Text style={styles.credentialName}>
                {CREDENTIAL_LABELS[c.kind] ?? c.kind}
                {c.licenseClass ? ` — ${c.licenseClass}` : ""}
                {c.expiresAt ? `, exp. ${c.expiresAt.slice(0, 7)}` : ""}
              </Text>
              {c.verified ? (
                <View style={styles.seal}>
                  <View style={styles.sealDot} />
                  <Text style={styles.sealLabel}>Verified</Text>
                </View>
              ) : (
                <Text style={styles.selfReported}>Self-reported</Text>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.note}>
          Verification confirms documents exist and match the listed name. It is not a guarantee
          of competence; vessel owners make their own crew decisions.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>FISHERIES &amp; VESSELS</Text>
        <Text style={styles.list}>{profile.fisheries.join(" · ")}</Text>
        <Text style={styles.listMuted}>{profile.vesselExperience.join(" · ")}</Text>
        <Text style={styles.listMuted}>Works: {profile.regions.join(" · ")}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>NEXT OPEN DATES</Text>
        {openDates.length ? (
          <Text style={styles.dates}>{openDates.map((a) => fmtDate(a.date)).join(" · ")}</Text>
        ) : (
          <Text style={styles.listMuted}>Booked out for the listed window.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>BOOKING</Text>
        <Text style={styles.list}>
          Booking runs on the web for now — the mobile booking flow arrives in a later phase.
          Requests go through the web booking form, and {firstName} accepts or declines every
          request there at their sole discretion.
        </Text>
        <Pressable
          style={styles.webButton}
          onPress={() => Linking.openURL(`${API_URL}/bookings/new?crew=${profile.id}`)}
        >
          <Text style={styles.webButtonText}>Open {firstName}&apos;s booking form on the web</Text>
        </Pressable>
      </View>

      <View style={styles.disclaimer}>
        <DisclaimerD2 />
      </View>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  content: { paddingBottom: space.s7 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s4,
    padding: space.s5,
    backgroundColor: color.boardBg,
  },
  centerText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center" },
  link: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
  retry: {
    borderWidth: 1,
    borderColor: color.brass,
    paddingVertical: space.s2,
    paddingHorizontal: space.s5,
  },
  retryText: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },

  head: { backgroundColor: color.navyDeep, padding: space.s5, gap: space.s2 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s3 },
  eyebrow: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: color.navyMuted,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  name: {
    fontFamily: font.display,
    fontSize: 30,
    color: color.whiteCrisp,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  role: { fontFamily: font.body, fontSize: 14, color: color.navyMuted },
  bio: { fontFamily: font.body, fontSize: 14, color: color.navyMuted, marginTop: space.s2 },

  seal: { flexDirection: "row", alignItems: "center", gap: space.s1 },
  sealDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.brass,
    borderWidth: 1,
    borderColor: color.brassText,
  },
  sealLabel: { fontFamily: font.mono, fontSize: 10, letterSpacing: 0.6, color: color.brassBright },
  selfReported: { fontFamily: font.body, fontSize: 12, fontStyle: "italic", color: color.inkSoft },

  panel: {
    backgroundColor: color.whiteCrisp,
    marginTop: space.s2,
    padding: space.s5,
    gap: space.s3,
    borderTopWidth: 1,
    borderTopColor: color.lineOnWhite,
  },
  panelEyebrow: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: color.brassText,
    textTransform: "uppercase",
  },

  facts: { gap: space.s2 },
  fact: { flexDirection: "row", justifyContent: "space-between" },
  factLabel: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  factValue: { fontFamily: font.mono, fontSize: 14, color: color.ink },

  credentialList: { gap: space.s3 },
  credentialRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s3 },
  credentialName: { fontFamily: font.body, fontSize: 13, color: color.ink, flexShrink: 1 },
  note: { fontFamily: font.body, fontSize: 12, color: color.inkSoft, marginTop: space.s2 },

  list: { fontFamily: font.body, fontSize: 14, color: color.ink },
  listMuted: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  dates: { fontFamily: font.mono, fontSize: 14, color: color.ink },

  webButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingVertical: space.s2,
    paddingHorizontal: space.s4,
    marginTop: space.s1,
  },
  webButtonText: { fontFamily: font.body, fontSize: 13, fontWeight: "600", color: color.brassText },

  disclaimer: { marginTop: space.s2 },
});
