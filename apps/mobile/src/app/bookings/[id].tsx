import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { fmtUsd } from "@crewmarket/types";
import { authClient, useSession } from "../../../lib/auth-client";
import { API_URL } from "../../../lib/api";
import { authGuardState } from "../../../lib/auth-guard";
import { STATE_LABELS, eventLabel, holdFundsLabel } from "../../../lib/booking-labels";
import { fmtTripDates, type BookingDetail } from "../../../lib/booking-types";
import { color, font, radius, space } from "../../../lib/tokens";

/* Booking detail — the Voyage Ledger on the phone (slice 3, Task 7). Loads
   GET /api/bookings/[id] (party-safe; 404 if you're not a party). Actions POST
   to /event and re-fetch. The boat's pay step opens Stripe Checkout in a browser
   (POST /checkout → url) and, on return, polls until the webhook flips the
   booking to funds-held — never trusting the redirect (webhook is source of
   truth). "Funds held", never "escrow" (G-1); no supervision language (M-2/M-3). */

function serverError(error: unknown): string | null {
  if (error && typeof error === "object") {
    const e = error as { error?: unknown; message?: unknown };
    if (typeof e.error === "string" && e.error) return e.error;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; booking: BookingDetail };

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchBooking = useCallback(async () => {
    const { data, error } = await authClient.$fetch<{ booking: BookingDetail }>(
      `${API_URL}/api/bookings/${id}`,
    );
    if (error || !data) setLoad({ kind: "error" });
    else setLoad({ kind: "ready", booking: data.booking });
  }, [id]);

  // UNKNOWN (session fetch failed — SecureStore may still hold a valid session,
  // e.g. an Expo Go JS reload right after the Checkout browser) must NOT
  // redirect: fetch anyway and let the API's 401 land in the error/Retry view.
  useFocusEffect(
    useCallback(() => {
      if (gate === "CHECKING") return;
      if (gate === "SIGNED_OUT") {
        router.replace("/sign-in");
        return;
      }
      void fetchBooking();
    }, [gate, router, fetchBooking]),
  );

  const fireEvent = useCallback(
    async (event: string) => {
      if (busy) return;
      setBusy(true);
      setActionError(null);
      const { data, error } = await authClient.$fetch<{ ok: boolean; state: string }>(
        `${API_URL}/api/bookings/${id}/event`,
        { method: "POST", body: { event } },
      );
      if (error || !data) setActionError(serverError(error) ?? "Couldn't do that — try again.");
      await fetchBooking();
      setBusy(false);
    },
    [busy, id, fetchBooking],
  );

  const payNow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const { data, error } = await authClient.$fetch<{ url: string }>(
      `${API_URL}/api/bookings/${id}/checkout`,
      { method: "POST", body: {} },
    );
    if (error || !data?.url) {
      setActionError(serverError(error) ?? "Couldn't start payment — try again.");
      setBusy(false);
      return;
    }
    await WebBrowser.openBrowserAsync(data.url);
    // Never trust the redirect — poll the booking until the webhook confirms.
    setConfirming(true);
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data: d } = await authClient.$fetch<{ booking: BookingDetail }>(
        `${API_URL}/api/bookings/${id}`,
      );
      if (d?.booking && d.booking.state !== "ACCEPTED") {
        setLoad({ kind: "ready", booking: d.booking });
        break;
      }
    }
    setConfirming(false);
    await fetchBooking();
    setBusy(false);
  }, [busy, id, fetchBooking]);

  if (gate === "CHECKING" || gate === "SIGNED_OUT" || load.kind === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.navyDeep} />
      </View>
    );
  }
  if (load.kind === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Couldn&apos;t load this booking.</Text>
        <Pressable style={styles.retry} onPress={() => fetchBooking()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const b = load.booking;
  const canPay = b.state === "ACCEPTED" && b.role === "BOAT";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{b.role === "BOAT" ? "CREW" : "BOAT"}</Text>
        <Text style={styles.counterparty} accessibilityRole="header">
          {b.counterpartyName}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{STATE_LABELS[b.state] ?? b.state}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.eyebrowInk}>TRIP</Text>
        <Text style={styles.line}>{fmtTripDates(b.dates)}</Text>
        <View style={styles.money}>
          <Row label="Crew rate" value={fmtUsd(b.rateCents)} />
          <Row label="Platform fee" value={fmtUsd(b.feeCents)} />
          <Row label="Total" value={fmtUsd(b.totalCents)} strong />
        </View>
        {b.hasRefund ? <Text style={styles.noteMuted}>A refund is on record for this booking.</Text> : null}
      </View>

      {confirming ? (
        <Text style={styles.confirm}>Payment received by Stripe — confirming the transfer of funds…</Text>
      ) : null}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.actions}>
        {canPay ? (
          <Pressable
            style={[styles.btnBrass, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={payNow}
            accessibilityRole="button"
          >
            <Text style={styles.btnBrassText}>{busy ? "Working…" : holdFundsLabel(b.totalCents)}</Text>
          </Pressable>
        ) : null}
        {b.availableEvents.map((event) => (
          <Pressable
            key={event}
            style={[styles.btnGhost, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => fireEvent(event)}
            accessibilityRole="button"
          >
            <Text style={styles.btnGhostText}>{eventLabel(event)}</Text>
          </Pressable>
        ))}
        {!canPay && b.availableEvents.length === 0 ? (
          <Text style={styles.noteMuted}>Nothing to do here right now.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, strong && styles.moneyStrong]}>{label}</Text>
      <Text style={[styles.moneyValue, strong && styles.moneyStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  content: { paddingBottom: space.s7 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s4, padding: space.s5, backgroundColor: color.boardBg },
  centerText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center" },
  retry: { borderWidth: 1, borderColor: color.brass, paddingVertical: space.s3, paddingHorizontal: space.s5, minHeight: 44, alignItems: "center", justifyContent: "center" },
  retryText: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
  head: { backgroundColor: color.navyDeep, padding: space.s5, gap: space.s2, borderBottomWidth: 1, borderBottomColor: color.brassEngrave },
  eyebrow: { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.8, color: color.navyMuted },
  counterparty: { fontFamily: font.displayBold, fontSize: 26, lineHeight: 34, color: color.whiteCrisp, letterSpacing: 0.3 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderColor: color.brassBright, borderRadius: radius, paddingVertical: 3, paddingHorizontal: space.s2, marginTop: space.s1 },
  badgeText: { fontFamily: font.mono, fontSize: 10, letterSpacing: 0.4, color: color.brassBright },
  panel: { backgroundColor: color.whiteCrisp, margin: space.s3, padding: space.s5, gap: space.s3, borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius },
  eyebrowInk: { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6, color: color.inkSoft },
  line: { fontFamily: font.body, fontSize: 15, color: color.ink },
  money: { gap: space.s2, marginTop: space.s2 },
  moneyRow: { flexDirection: "row", justifyContent: "space-between" },
  moneyLabel: { fontFamily: font.body, fontSize: 14, color: color.inkSoft },
  moneyValue: { fontFamily: font.mono, fontSize: 14, color: color.ink },
  moneyStrong: { color: color.ink, fontWeight: "700" },
  noteMuted: { fontFamily: font.body, fontSize: 13, color: color.inkSoft, paddingHorizontal: space.s3 },
  confirm: { fontFamily: font.mono, fontSize: 12, color: color.brassText, paddingHorizontal: space.s5, paddingTop: space.s2 },
  error: { fontFamily: font.body, fontSize: 13, color: color.brassText, paddingHorizontal: space.s5, paddingTop: space.s2 },
  actions: { padding: space.s5, gap: space.s3 },
  btnBrass: { backgroundColor: color.brassText, borderRadius: radius, minHeight: 48, alignItems: "center", justifyContent: "center" },
  btnBrassText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: "#ffffff" },
  btnGhost: { borderWidth: 1, borderColor: color.brass, borderRadius: radius, minHeight: 48, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: color.brassText },
  btnDisabled: { opacity: 0.5 },
});
