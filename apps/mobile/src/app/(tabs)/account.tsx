import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { authClient, signOut, useSession } from "../../../lib/auth-client";
import { API_URL } from "../../../lib/api";
import { authGuardState } from "../../../lib/auth-guard";
import { getBoard } from "../../../lib/board";
import type { Me } from "../../../lib/claim-state";
import { color, font, radius, space } from "../../../lib/tokens";

/* Account screen (slice 2, Task 6). Shows who's signed in and — for crew — the
   profile they drive on the board. No booking management here (that stays on the
   web); this is identity + a way out. Marketplace vocabulary only (M-1). */

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CREW: "Crew account",
  BOAT: "Boat account",
};

type ClaimState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "claimed"; displayName: string }
  | { kind: "error" };

export default function AccountScreen() {
  const router = useRouter();
  const { data: session, isPending, error: sessionError, refetch } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });
  const [signingOut, setSigningOut] = useState(false);
  const [claim, setClaim] = useState<ClaimState>({ kind: "idle" });

  const user = session?.user as { name?: string; accountType?: string } | undefined;
  const accountType = user?.accountType ?? null;

  // Redirect out only on the authoritative no-session answer (and not mid-
  // sign-out, which flips the session to null before we route home ourselves).
  // UNKNOWN (session fetch failed) renders a retry instead — see below.
  useEffect(() => {
    if (gate === "SIGNED_OUT" && !signingOut) {
      router.replace("/sign-in");
    }
  }, [gate, signingOut, router]);

  // Crew accounts: fetch /api/me through the authed client (sends the session
  // token), then resolve the claimed profile's name from the board cache.
  useEffect(() => {
    if (isPending || !session || accountType !== "CREW") return;
    let cancelled = false;
    // setState lives inside the async callback, not the effect body, to avoid
    // the synchronous cascading-render path (react-hooks/set-state-in-effect) —
    // same discipline as the board/profile screens' fetch callbacks.
    (async () => {
      setClaim({ kind: "loading" });
      try {
        // Absolute URL: authClient prepends its /api/auth base to relative paths,
        // so a bare "/api/me" would 404. Passing the full URL still runs the Expo
        // client's onRequest hook (session cookie + expo-origin get attached).
        const { data, error } = await authClient.$fetch<Me>(`${API_URL}/api/me`);
        if (cancelled) return;
        if (error || !data) {
          setClaim({ kind: "error" });
          return;
        }
        if (!data.claimedProfileId) {
          setClaim({ kind: "none" });
          return;
        }
        const board = await getBoard();
        if (cancelled) return;
        const profile = board.find((p) => p.id === data.claimedProfileId);
        setClaim(
          profile ? { kind: "claimed", displayName: profile.displayName } : { kind: "none" },
        );
      } catch {
        if (!cancelled) setClaim({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, session, accountType]);

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    router.replace("/");
  }

  // This screen renders from session data, so UNKNOWN can't proceed like the
  // booking screens do — offer a retry against the session endpoint instead.
  if (gate === "UNKNOWN" && !signingOut) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Couldn&apos;t check your session.</Text>
        <Pressable style={styles.retry} onPress={() => void refetch()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (gate === "CHECKING" || !session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.navyDeep} />
        <Text style={styles.centerText}>Loading your account…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>SIGNED IN</Text>
        <Text style={styles.name} accessibilityRole="header">
          {user?.name ?? "Your account"}
        </Text>
        {accountType && (
          <Text style={styles.accountType}>{ACCOUNT_TYPE_LABELS[accountType] ?? accountType}</Text>
        )}
      </View>

      {accountType === "CREW" && (
        <View style={styles.panel}>
          <Text style={styles.panelEyebrow}>YOUR PROFILE</Text>
          {claim.kind === "loading" && (
            <View style={styles.inline}>
              <ActivityIndicator color={color.navyDeep} />
              <Text style={styles.listMuted}>Checking the board…</Text>
            </View>
          )}
          {claim.kind === "claimed" && (
            <>
              <Text style={styles.list}>You drive this profile:</Text>
              <Text style={styles.profileName}>{claim.displayName}</Text>
              <Pressable
                style={styles.credRow}
                onPress={() => router.push("/credentials")}
                accessibilityRole="button"
              >
                <Text style={styles.credRowText}>Credentials</Text>
                <Text style={styles.credRowChevron}>›</Text>
              </Pressable>
            </>
          )}
          {claim.kind === "none" && (
            <Text style={styles.listMuted}>Claim your profile from the board.</Text>
          )}
          {claim.kind === "error" && (
            <Text style={styles.listMuted}>Couldn&apos;t check your profile — try again later.</Text>
          )}
        </View>
      )}

      <Pressable
        style={[styles.signOut, signingOut && styles.signOutDisabled]}
        onPress={onSignOut}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityState={{ disabled: signingOut }}
      >
        <Text style={styles.signOutText}>{signingOut ? "Signing out…" : "Sign out"}</Text>
      </Pressable>
    </ScrollView>
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
  name: {
    fontFamily: font.displayBold,
    fontSize: 30,
    lineHeight: 32,
    color: color.whiteCrisp,
    letterSpacing: 0.4,
  },
  accountType: { fontFamily: font.body, fontSize: 14, color: color.navyMuted },

  panel: {
    backgroundColor: color.whiteCrisp,
    marginTop: space.s3,
    marginHorizontal: space.s3,
    padding: space.s5,
    gap: space.s3,
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
  },
  panelEyebrow: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: color.inkSoft,
    textTransform: "uppercase",
  },
  inline: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  list: { fontFamily: font.body, fontSize: 14, color: color.ink },
  listMuted: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  profileName: {
    fontFamily: font.display,
    fontSize: 20,
    color: color.ink,
    letterSpacing: 0.3,
  },

  credRow: {
    marginTop: space.s3,
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingHorizontal: space.s4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  credRowText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: color.brassText },
  credRowChevron: { fontFamily: font.body, fontSize: 20, color: color.brassText },

  signOut: {
    marginTop: space.s5,
    marginHorizontal: space.s3,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
    backgroundColor: color.whiteCrisp,
  },
  signOutDisabled: { opacity: 0.5 },
  signOutText: { fontFamily: font.body, fontSize: 15, fontWeight: "600", color: color.brassText },

  retry: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
    backgroundColor: color.whiteCrisp,
  },
  retryText: { fontFamily: font.body, fontSize: 15, fontWeight: "600", color: color.brassText },
});
