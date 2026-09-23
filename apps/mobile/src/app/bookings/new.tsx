import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  fmtUsd,
  maxDaysFor,
  tripTypesFor,
  PLATFORM_FEE_RATE,
  PLATFORM_FEE_SIDE,
  TRIP_TYPE_LABELS,
  type TripType,
} from "@crewmarket/types";
import { DisclaimerD2 } from "../../../components/disclaimer-d2";
import { API_URL } from "../../../lib/api";
import { authClient, useSession } from "../../../lib/auth-client";
import { authGuardState } from "../../../lib/auth-guard";
import { cachedBoard, getBoard, type BoardProfile } from "../../../lib/board";
import {
  canSubmit,
  clampDays,
  draftPayload,
  draftQuote,
  effectiveDays,
  localIsoDate,
  type RequestDraft,
} from "../../../lib/request-form";
import { serverError } from "../../../lib/server-error";
import { color, font, radius, space } from "../../../lib/tokens";

/* Booking request form — native (slice 5). Section-for-section port of the web
   form (apps/web/app/bookings/new/request-form.tsx); every user-facing string
   is verbatim web copy. The quote here is PREVIEW ONLY (R4): the server
   recomputes from crew-listed rates at create. "Funds held", never "escrow"
   (G-1); trip types render only from crew-listed rates (M-2); the request
   cannot be sent without the P&I attestation (D-4). */

const FEE_PCT = `${Math.round(PLATFORM_FEE_RATE * 100)}%`;

type LoadState = "loading" | "not-found" | "error" | "ready";

export default function BookingRequestScreen() {
  const { crew: crewId } = useLocalSearchParams<{ crew: string }>();
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });

  const [profile, setProfile] = useState<BoardProfile | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [todayFloor] = useState(() => new Date()); // stable minimumDate for the mount

  // "set" only: Android fires onChange with the fallback value on dismiss too —
  // a cancelled dialog must never write a date into a funds-hold request.
  const onPickDate = useCallback((event: DateTimePickerEvent, picked?: Date) => {
    setShowAndroidPicker(false);
    if (event.type === "set" && picked) {
      setDraft((d) => (d ? { ...d, startDate: localIsoDate(picked) } : d));
    }
  }, []);

  // SIGNED_OUT is the only redirect (auth-guard discipline): on UNKNOWN the
  // form renders and the API's 401/403 is the authority, surfaced inline.
  useEffect(() => {
    if (gate === "SIGNED_OUT") router.replace("/sign-in");
  }, [gate, router]);

  useEffect(() => {
    let cancelled = false;

    function resolveFrom(all: BoardProfile[]) {
      if (cancelled) return;
      const found = all.find((p) => p.id === crewId) ?? null;
      setProfile(found);
      if (found) {
        const offered = tripTypesFor(found);
        // Seed today: the iOS compact picker displays today by default and fires
        // no event when the user taps the already-shown value.
        setDraft({ tripType: offered[0], days: 1, startDate: localIsoDate(new Date()), piAttested: false });
      }
      setLoad(found ? "ready" : "not-found");
    }

    const cached = cachedBoard();
    if (cached) {
      resolveFrom(cached);
      return;
    }
    // Cold start / deep link: same convergence as the profile screen — board
    // and form read the one fetch, so they can never disagree.
    getBoard()
      .then(resolveFrom)
      .catch(() => {
        if (!cancelled) setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  async function onSubmit() {
    if (!profile || !draft || busy || !canSubmit(profile, draft)) return; // guard double-tap
    setBusy(true);
    setSubmitError(null);
    try {
      const { data, error } = await authClient.$fetch<{ id: string }>(`${API_URL}/api/bookings`, {
        method: "POST",
        body: draftPayload(profile.id, draft),
      });
      if (error || !data) {
        setSubmitError(serverError(error) ?? "Couldn't send the request — try again.");
        return;
      }
      // replace, not push: back from the ledger returns to the profile, not a stale form.
      router.replace(`/bookings/${data.id}`);
    } catch {
      setSubmitError("Couldn't send the request — try again.");
    } finally {
      setBusy(false);
    }
  }

  // Mirrors crew/[id].tsx's named retry — same seeded draft as the load effect (change 2).
  function retry() {
    setLoad("loading");
    getBoard()
      .then((all) => {
        const found = all.find((p) => p.id === crewId) ?? null;
        setProfile(found);
        if (found) {
          const offered = tripTypesFor(found);
          setDraft({ tripType: offered[0], days: 1, startDate: localIsoDate(new Date()), piAttested: false });
        }
        setLoad(found ? "ready" : "not-found");
      })
      .catch(() => setLoad("error"));
  }

  if (gate === "CHECKING" || gate === "SIGNED_OUT" || load === "loading") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Booking request" }} />
        <ActivityIndicator color={color.navyDeep} />
      </View>
    );
  }

  if (load === "error") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Booking request" }} />
        <Text style={styles.centerText}>Can&apos;t reach the crew board — check your connection.</Text>
        <Pressable style={styles.retry} accessibilityRole="button" onPress={retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (load === "not-found" || !profile || !draft) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Booking request" }} />
        <Text style={styles.centerText}>This crew profile isn&apos;t on the board.</Text>
      </View>
    );
  }

  const offered = tripTypesFor(profile);
  const firstName = profile.displayName.split(" ")[0];
  const multi = maxDaysFor(draft.tripType) > 1;
  const quote = draftQuote(profile, draft);
  const ready = canSubmit(profile, draft);
  const boatName = session?.user?.name ?? "your boat account";
  const pickerValue = new Date(draft.startDate + "T00:00:00");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Booking request" }} />
      <Text style={styles.title} accessibilityRole="header">Request {profile.displayName}</Text>

      {/* Trip type — only crew-listed rates render (M-2). */}
      <Text style={styles.label}>Trip type · only the rates {profile.displayName} lists</Text>
      <View style={styles.plateRow}>
        {offered.map((t) => {
          const active = draft.tripType === t;
          return (
            <Pressable
              key={t}
              style={[styles.plate, active && styles.plateActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() =>
                setDraft({
                  ...draft,
                  tripType: t,
                  days: clampDays(t, draft.days),
                })
              }
            >
              <Text style={[styles.plateText, active && styles.plateTextActive]}>
                {TRIP_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Date (+ days when multi-day). Platform picker; server takes any valid date. */}
      <Text style={styles.label}>{multi ? "First day" : "Trip date"}</Text>
      {Platform.OS === "ios" ? (
        <View style={styles.dateRow}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="compact"
            minimumDate={todayFloor}
            onChange={onPickDate}
          />
        </View>
      ) : (
        <>
          <Pressable
            style={styles.dateButton}
            accessibilityRole="button"
            onPress={() => setShowAndroidPicker(true)}
          >
            <Text style={styles.dateButtonText}>{draft.startDate}</Text>
          </Pressable>
          {showAndroidPicker && (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              minimumDate={todayFloor}
              onChange={onPickDate}
            />
          )}
        </>
      )}

      {multi && (
        <>
          <Text style={styles.label}>
            Days (consecutive, max {maxDaysFor(draft.tripType)})
          </Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel="Fewer days"
              onPress={() => setDraft({ ...draft, days: clampDays(draft.tripType, draft.days - 1) })}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepCount}>{draft.days}</Text>
            <Pressable
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel="More days"
              onPress={() => setDraft({ ...draft, days: clampDays(draft.tripType, draft.days + 1) })}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* The money block: same numbers from here onward (R4); fee itemized (P-3). */}
      <View style={styles.money}>
        <Text style={styles.moneyLabel}>The numbers · rate set by the crew member</Text>
        {quote ? (
          <>
            <View style={styles.moneyLine}>
              <Text style={styles.moneyDt}>
                {profile.displayName} — {TRIP_TYPE_LABELS[draft.tripType].toLowerCase()}
                {effectiveDaysLabel(draft.tripType, draft.days)}
              </Text>
              <Text style={styles.moneyDd}>{fmtUsd(quote.rateCents)}</Text>
            </View>
            <View style={styles.moneyLine}>
              <Text style={styles.moneyDt}>
                Platform fee ({FEE_PCT},{" "}
                {PLATFORM_FEE_SIDE === "BOAT" ? "paid by the boat" : "deducted from crew payout"})
              </Text>
              <Text style={styles.moneyDd}>{fmtUsd(quote.feeCents)}</Text>
            </View>
            <View style={[styles.moneyLine, styles.moneyTotal]}>
              <Text style={styles.moneyDtTotal}>
                Held at booking, released after the trip + 48h review
              </Text>
              <Text style={styles.moneyDdTotal}>{fmtUsd(quote.totalCents)}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Pick a valid number of days to see the numbers.</Text>
        )}
      </View>

      {/* Rule D-4: insurance attestation is the boat's, recorded at booking. */}
      <Pressable
        style={styles.attestRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.piAttested }}
        onPress={() => setDraft({ ...draft, piAttested: !draft.piAttested })}
      >
        <View style={[styles.checkbox, draft.piAttested && styles.checkboxChecked]}>
          {draft.piAttested && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.attestText}>
          I confirm this vessel carries P&amp;I (protection &amp; indemnity) coverage for this
          trip. Vessel owners are solely responsible for insurance and crew selection.
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        This request forms a booking agreement between <Text style={styles.hintBold}>{boatName}</Text>{" "}
        and <Text style={styles.hintBold}>{profile.displayName}</Text>. Crew Market keeps the
        ledger and holds the funds; it is not a party to the agreement. Cancellation and refund
        terms are stated in the agreement.
      </Text>

      {submitError && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorLabel}>Not sent</Text>
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      )}

      <Pressable
        style={[styles.submit, (!ready || busy) && styles.submitDisabled]}
        accessibilityRole="button"
        disabled={!ready || busy}
        onPress={onSubmit}
      >
        <Text style={styles.submitText}>
          {busy
            ? "Sending request…"
            : ready && quote
              ? `Send request — ${fmtUsd(quote.totalCents)} held at booking`
              : "Send request"}
        </Text>
      </Pressable>
      <Text style={styles.hint}>
        {firstName} can accept or decline freely — declining never costs crew anything on Crew
        Market.
      </Text>

      {/* D-2 placement: booking flow (CLAUDE.md hard constraint 6). */}
      <DisclaimerD2 />
    </ScrollView>
  );
}

/** " × 3 days" suffix for the crew line — only when more than one effective day. */
function effectiveDaysLabel(tripType: TripType, days: number): string {
  const eff = effectiveDays(tripType, days);
  return eff > 1 ? ` × ${eff} days` : "";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  content: { padding: space.s4, paddingBottom: space.s7, gap: space.s3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s3, backgroundColor: color.boardBg },
  centerText: { fontFamily: font.body, color: color.inkSoft, textAlign: "center", paddingHorizontal: space.s5 },
  retry: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s4 },
  retryText: { fontFamily: font.body, color: color.ink },
  title: { fontFamily: font.display, fontSize: 24, color: color.navyDeep, textTransform: "uppercase" },
  label: { fontFamily: font.mono, fontSize: 11, color: color.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginTop: space.s2 },
  plateRow: { flexDirection: "row", gap: space.s2, flexWrap: "wrap" },
  plate: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s3, backgroundColor: color.whiteCrisp },
  plateActive: { backgroundColor: color.navyDeep, borderColor: color.navyDeep },
  plateText: { fontFamily: font.body, color: color.ink },
  plateTextActive: { color: color.whiteCrisp },
  dateRow: { alignSelf: "flex-start" },
  dateButton: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s3, backgroundColor: color.whiteCrisp, alignSelf: "flex-start" },
  dateButtonText: { fontFamily: font.mono, color: color.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  stepBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, backgroundColor: color.whiteCrisp },
  stepBtnText: { fontFamily: font.display, fontSize: 18, color: color.navyDeep },
  stepCount: { fontFamily: font.mono, fontSize: 16, color: color.ink, minWidth: 28, textAlign: "center" },
  money: { borderWidth: 1, borderColor: color.brassEngrave, borderRadius: radius, backgroundColor: color.whiteCrisp, padding: space.s3, gap: space.s2, marginTop: space.s2 },
  moneyLabel: { fontFamily: font.mono, fontSize: 11, color: color.brassText, textTransform: "uppercase", letterSpacing: 0.5 },
  moneyLine: { flexDirection: "row", justifyContent: "space-between", gap: space.s3 },
  moneyDt: { fontFamily: font.body, color: color.ink, flexShrink: 1 },
  moneyDd: { fontFamily: font.mono, color: color.ink },
  moneyTotal: { borderTopWidth: 1, borderTopColor: color.lineOnWhite, paddingTop: space.s2 },
  moneyDtTotal: { fontFamily: font.body, color: color.navyDeep, flexShrink: 1 },
  moneyDdTotal: { fontFamily: font.mono, color: color.brassText, fontSize: 16 },
  attestRow: { flexDirection: "row", gap: space.s3, marginTop: space.s2 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius, alignItems: "center", justifyContent: "center", backgroundColor: color.whiteCrisp },
  checkboxChecked: { backgroundColor: color.brassText, borderColor: color.brassText },
  checkmark: { color: color.whiteCrisp, fontSize: 14, lineHeight: 16 },
  attestText: { fontFamily: font.body, fontSize: 13, color: color.ink, flex: 1, lineHeight: 18 },
  hint: { fontFamily: font.body, fontSize: 12, color: color.inkSoft, lineHeight: 17 },
  hintBold: { color: color.ink, fontFamily: font.body },
  errorBox: { borderWidth: 1, borderColor: color.lineStrong, borderLeftWidth: 3, borderLeftColor: color.brass, backgroundColor: color.whiteCrisp, borderRadius: radius, padding: space.s3 },
  errorLabel: { fontFamily: font.mono, fontSize: 10, color: color.brassText, textTransform: "uppercase", letterSpacing: 0.5 },
  errorText: { fontFamily: font.body, color: color.ink, marginTop: space.s1 },
  submit: { backgroundColor: color.brassText, borderRadius: radius, paddingVertical: space.s3, alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: space.s2 },
  submitDisabled: { opacity: 0.45 },
  submitText: { fontFamily: font.display, fontSize: 15, color: color.whiteCrisp, textTransform: "uppercase", letterSpacing: 0.5 },
});
