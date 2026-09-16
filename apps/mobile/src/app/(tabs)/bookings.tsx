import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { fmtUsd } from "@crewmarket/types";
import { authClient, useSession } from "../../../lib/auth-client";
import { API_URL } from "../../../lib/api";
import { authGuardState } from "../../../lib/auth-guard";
import { Anchor } from "../../../components/engravings";
import { STATE_LABELS } from "../../../lib/booking-labels";
import { fmtTripDates, type BookingSummary } from "../../../lib/booking-types";
import { color, font, radius, space } from "../../../lib/tokens";

/* Bookings tab (slice 3, Task 6). The signed-in user's bookings from
   GET /api/bookings (party-safe summaries, P-4). Session-gated like Account;
   the Board tab stays public. Refetches on focus so a state change made on the
   detail screen (accept / pay / cancel) shows here on return. Marketplace
   vocabulary only (M-1) — nothing here assigns or supervises work (M-2/M-3). */

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; bookings: BookingSummary[] };

export default function BookingsScreen() {
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const fetchBookings = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoad({ kind: "loading" });
    const { data, error } = await authClient.$fetch<{ bookings: BookingSummary[] }>(
      `${API_URL}/api/bookings`,
    );
    if (error || !data) setLoad({ kind: "error" });
    else setLoad({ kind: "ready", bookings: data.bookings });
    if (isRefresh) setRefreshing(false);
  }, []);

  // Redirect signed-out visitors; otherwise (re)load on every focus. UNKNOWN
  // (session fetch failed — a valid session may still sit in SecureStore) must
  // NOT redirect: fetch anyway and let the API's 401 land in the error panel.
  useFocusEffect(
    useCallback(() => {
      if (gate === "CHECKING") return;
      if (gate === "SIGNED_OUT") {
        router.replace("/sign-in");
        return;
      }
      void fetchBookings();
    }, [gate, router, fetchBookings]),
  );

  if (gate === "CHECKING" || gate === "SIGNED_OUT") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.navyDeep} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={load.kind === "ready" ? load.bookings : []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} tintColor={color.navyDeep} />
      }
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.eyebrow}>YOUR BOOKINGS</Text>
          <Text style={styles.title} accessibilityRole="header">
            Bookings
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/bookings/${item.id}`)}
          accessibilityRole="button"
        >
          <View style={styles.rowMain}>
            <Text style={styles.counterparty} numberOfLines={1}>
              {item.counterpartyName}
            </Text>
            <Text style={styles.meta}>
              {fmtTripDates(item.dates)} · {fmtUsd(item.totalCents)}
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{STATE_LABELS[item.state] ?? item.state}</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        load.kind === "loading" ? (
          <View style={styles.center}>
            <ActivityIndicator color={color.navyDeep} />
            <Text style={styles.centerText}>Loading your bookings…</Text>
          </View>
        ) : load.kind === "error" ? (
          <View style={styles.panel}>
            <Text style={styles.note}>Couldn&apos;t load your bookings — pull to refresh.</Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <Anchor size={26} opacity={0.5} />
            <Text style={styles.note}>
              No bookings yet. Trips you&apos;ve requested or agreed to will list here.
            </Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: color.boardBg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s3, padding: space.s5 },
  centerText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center" },
  head: {
    backgroundColor: color.navyDeep,
    padding: space.s5,
    gap: space.s2,
    borderBottomWidth: 1,
    borderBottomColor: color.brassEngrave,
  },
  eyebrow: { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6, color: color.navyMuted },
  title: {
    fontFamily: font.displayBold,
    fontSize: 30,
    lineHeight: 38,
    color: color.whiteCrisp,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    paddingVertical: space.s4,
    paddingHorizontal: space.s5,
    minHeight: 64,
    backgroundColor: color.whiteCrisp,
    borderBottomWidth: 1,
    borderBottomColor: color.lineStrong,
  },
  rowMain: { flex: 1, gap: 2 },
  counterparty: { fontFamily: font.display, fontSize: 16, color: color.ink },
  meta: { fontFamily: font.mono, fontSize: 12, letterSpacing: 0.3, color: color.inkSoft },
  badge: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingVertical: 3,
    paddingHorizontal: space.s2,
  },
  badgeText: { fontFamily: font.mono, fontSize: 10, letterSpacing: 0.4, color: color.brassText },
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
