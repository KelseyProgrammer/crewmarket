import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "../../../lib/auth-client";
import { Anchor } from "../../../components/engravings";
import { color, font, radius, space } from "../../../lib/tokens";

/* Bookings tab (slice 3). Placeholder shell — the GET /api/bookings list lands
   in Task 6. Session-gated like the Account tab: signed-out visitors are routed
   to sign-in (the Board tab stays public). Marketplace vocabulary only (M-1);
   nothing here assigns or supervises work. */
export default function BookingsScreen() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Redirect out once we know there's no session — same guard the Account tab
  // uses. Kept in an effect (not render) so routing happens post-commit.
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.navyDeep} />
        <Text style={styles.centerText}>Loading your bookings…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>YOUR BOOKINGS</Text>
        <Text style={styles.title} accessibilityRole="header">
          Bookings
        </Text>
      </View>
      <View style={styles.panel}>
        <Anchor size={26} opacity={0.5} />
        <Text style={styles.note}>
          Your booking log is coming in this update — trips you&apos;ve requested or
          agreed to will list here.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s4,
    padding: space.s5,
    backgroundColor: color.boardBg,
  },
  centerText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center" },
  head: {
    backgroundColor: color.navyDeep,
    padding: space.s5,
    gap: space.s2,
    borderBottomWidth: 1,
    borderBottomColor: color.brassEngrave,
  },
  eyebrow: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    color: color.navyMuted,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 30,
    lineHeight: 32,
    color: color.whiteCrisp,
    letterSpacing: 0.4,
  },
  panel: {
    backgroundColor: color.whiteCrisp,
    marginTop: space.s3,
    marginHorizontal: space.s3,
    padding: space.s5,
    gap: space.s3,
    alignItems: "flex-start",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.lineStrong,
    borderRadius: radius,
  },
  note: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.inkSoft },
});
