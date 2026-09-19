import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { authClient, useSession } from "../../lib/auth-client";
import { API_URL } from "../../lib/api";
import { authGuardState } from "../../lib/auth-guard";
import { CREDENTIAL_KINDS, kindLabel, stateLabel } from "../../lib/credential-labels";
import {
  isValidExpiry,
  validateUpload,
  type BeginResponse,
  type CredentialDocSummary,
  type PickedFile,
} from "../../lib/credential-upload";
import { color, font, radius, space } from "../../lib/tokens";

/* Credentials screen (slice 4). Crew-only surface for license/cert documents:
   list (verified state is admin-earned, V-1), upload via the presigned
   begin → PUT → confirm protocol (the file goes straight to storage — it never
   passes through our server process, V-2), owner-only short-lived View, and
   Remove. Copy is about documents under review, never competence (V-3, M-1).
   uploadAsync must NOT carry auth headers — the presigned URL IS the auth. */

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
  | { kind: "denied" } // BOAT account or unclaimed crew (deep-link case)
  | { kind: "ready"; docs: CredentialDocSummary[] };

export default function CredentialsScreen() {
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [licenseClass, setLicenseClass] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const fetchDocs = useCallback(async () => {
    const { data, error } = await authClient.$fetch<{ docs: CredentialDocSummary[] }>(
      `${API_URL}/api/credentials`,
    );
    if (error || !data) {
      const status = (error as { status?: number } | null)?.status;
      setLoad(status === 403 ? { kind: "denied" } : { kind: "error" });
      return;
    }
    setLoad({ kind: "ready", docs: data.docs });
  }, []);

  // UNKNOWN (session fetch failed — SecureStore may still hold a valid
  // session) must NOT redirect: fetch anyway and let a real 401 land in the
  // error/Retry view. Same discipline as the booking screens.
  useFocusEffect(
    useCallback(() => {
      if (gate === "CHECKING") return;
      if (gate === "SIGNED_OUT") {
        router.replace("/sign-in");
        return;
      }
      void fetchDocs();
    }, [gate, router, fetchDocs]),
  );

  const viewDoc = useCallback(async (id: string) => {
    setListError(null);
    const { data, error } = await authClient.$fetch<{ url: string }>(
      `${API_URL}/api/credentials/${id}/view`,
      { method: "POST", body: {} },
    );
    if (error || !data?.url) {
      setListError(serverError(error) ?? "Couldn't open that document — try again.");
      return;
    }
    // The URL expires in 60s — open immediately, never store it.
    await WebBrowser.openBrowserAsync(data.url);
  }, []);

  const removeDoc = useCallback(
    (id: string) => {
      Alert.alert("Remove this document?", "This deletes the file and its record.", [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setListError(null);
              const { error } = await authClient.$fetch(`${API_URL}/api/credentials/${id}`, {
                method: "DELETE",
              });
              if (error) setListError(serverError(error) ?? "Couldn't remove that — try again.");
              await fetchDocs();
            })();
          },
        },
      ]);
    },
    [fetchDocs],
  );

  const startUpload = useCallback(
    async (file: PickedFile) => {
      if (busy) return;
      if (!kind) {
        setFormError("Choose a credential type from the list.");
        return;
      }
      const invalid = validateUpload(file.contentType, file.sizeBytes);
      if (invalid) {
        setFormError(invalid);
        return;
      }
      if (expiresAt.trim() && !isValidExpiry(expiresAt.trim())) {
        setFormError("Enter a valid expiry date (YYYY-MM-DD).");
        return;
      }
      setBusy(true);
      setFormError(null);
      try {
        const { data: begin, error: beginErr } = await authClient.$fetch<BeginResponse>(
          `${API_URL}/api/credentials/begin`,
          {
            method: "POST",
            body: { kind, contentType: file.contentType, sizeBytes: file.sizeBytes },
          },
        );
        if (beginErr || !begin) {
          setFormError(serverError(beginErr) ?? "Couldn't start the upload — try again.");
          return;
        }
        // Straight to storage via the presigned URL (V-2) — no auth headers here.
        const put = await FileSystem.uploadAsync(begin.putUrl, file.uri, {
          httpMethod: "PUT",
          headers: { "Content-Type": file.contentType },
        });
        if (put.status < 200 || put.status >= 300) {
          setFormError("Upload didn't complete — check your connection and try again.");
          return;
        }
        const { error: confirmErr } = await authClient.$fetch(
          `${API_URL}/api/credentials/confirm`,
          {
            method: "POST",
            body: {
              docId: begin.docId,
              s3Key: begin.s3Key,
              kind,
              licenseClass: licenseClass.trim() || undefined,
              expiresAt: expiresAt.trim() || undefined,
            },
          },
        );
        // 409 = this exact confirm already landed (retry after success) — treat as saved.
        const confirmStatus = (confirmErr as { status?: number } | null)?.status;
        if (confirmErr && confirmStatus !== 409) {
          setFormError(serverError(confirmErr) ?? "Couldn't save the document — try again.");
          return;
        }
        setKind(null);
        setLicenseClass("");
        setExpiresAt("");
        await fetchDocs();
      } catch {
        setFormError("Something went wrong — try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, kind, licenseClass, expiresAt, fetchDocs],
  );

  // Pickers normalize to PickedFile. fileSize/mimeType can be missing on some
  // platforms — fall back to getInfoAsync / jpeg, then validate.
  async function resolveSize(uri: string, fromAsset: number | undefined): Promise<number> {
    if (typeof fromAsset === "number" && fromAsset > 0) return fromAsset;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : 0;
  }

  const pickCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setFormError("Camera access is off — enable it in Settings to photograph a document.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await startUpload({
      uri: a.uri,
      contentType: a.mimeType ?? "image/jpeg",
      sizeBytes: await resolveSize(a.uri, a.fileSize),
    });
  }, [startUpload]);

  const pickLibrary = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await startUpload({
      uri: a.uri,
      contentType: a.mimeType ?? "image/jpeg",
      sizeBytes: await resolveSize(a.uri, a.fileSize),
    });
  }, [startUpload]);

  const pickFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await startUpload({
      uri: a.uri,
      contentType: a.mimeType ?? "application/pdf",
      sizeBytes: await resolveSize(a.uri, a.size),
    });
  }, [startUpload]);

  if (gate === "CHECKING" || gate === "SIGNED_OUT" || load.kind === "loading") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Credentials" }} />
        <ActivityIndicator color={color.navyDeep} />
      </View>
    );
  }
  if (load.kind === "denied") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Credentials" }} />
        <Text style={styles.centerText}>
          Credentials live on crew accounts with a claimed board profile.
        </Text>
      </View>
    );
  }
  if (load.kind === "error") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Credentials" }} />
        <Text style={styles.centerText}>Couldn&apos;t load your documents.</Text>
        <Pressable style={styles.retry} onPress={() => void fetchDocs()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Credentials" }} />
      <View style={styles.head}>
        <Text style={styles.eyebrow}>DOCUMENTS</Text>
        <Text style={styles.lede}>
          Upload license and certification documents for admin review. Documents stay private;
          your public listing shows only the credential details.
        </Text>
      </View>

      {listError ? <Text style={styles.error}>{listError}</Text> : null}

      {load.docs.length === 0 ? (
        <View style={styles.panel}>
          <Text style={styles.muted}>No documents uploaded yet.</Text>
        </View>
      ) : (
        load.docs.map((d) => (
          <View key={d.id} style={styles.panel}>
            <Text style={styles.docKind}>{kindLabel(d.kind)}</Text>
            {d.licenseClass ? <Text style={styles.docLine}>{d.licenseClass}</Text> : null}
            {d.expiresAt ? <Text style={styles.docMeta}>expires {d.expiresAt}</Text> : null}
            <Text style={styles.docMeta}>uploaded {d.uploadedAt}</Text>
            <Text style={d.verified ? styles.stateVerified : styles.stateSelf}>
              {stateLabel(d.verified)}
            </Text>
            <View style={styles.rowActions}>
              <Pressable
                style={styles.btnGhostSmall}
                onPress={() => void viewDoc(d.id)}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>View</Text>
              </Pressable>
              <Pressable
                style={styles.btnGhostSmall}
                onPress={() => removeDoc(d.id)}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>ADD A DOCUMENT</Text>
        <Text style={styles.muted}>PDF, JPEG, or PNG — up to 10 MB.</Text>

        <Text style={styles.fieldLabel}>Credential type</Text>
        <View style={styles.kinds}>
          {CREDENTIAL_KINDS.map((k) => (
            <Pressable
              key={k}
              style={[styles.kindChip, kind === k && styles.kindChipOn]}
              onPress={() => setKind(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.kindChipText, kind === k && styles.kindChipTextOn]}>
                {kindLabel(k)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>License class (optional)</Text>
        <TextInput
          style={styles.input}
          value={licenseClass}
          onChangeText={setLicenseClass}
          placeholder="e.g. Master 100T"
          placeholderTextColor={color.inkSoft}
          maxLength={80}
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Expires (optional)</Text>
        <TextInput
          style={styles.input}
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={color.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <View style={styles.sources}>
          <Pressable
            style={[styles.btnBrass, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void pickCamera()}
            accessibilityRole="button"
          >
            <Text style={styles.btnBrassText}>{busy ? "Uploading…" : "Take photo"}</Text>
          </Pressable>
          <Pressable
            style={[styles.btnGhost, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void pickLibrary()}
            accessibilityRole="button"
          >
            <Text style={styles.btnGhostText}>Photo library</Text>
          </Pressable>
          <Pressable
            style={[styles.btnGhost, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void pickFile()}
            accessibilityRole="button"
          >
            <Text style={styles.btnGhostText}>Choose file</Text>
          </Pressable>
        </View>
        <Text style={styles.finePrint}>
          Verification means an admin reviewed the document — it&apos;s never self-set.
        </Text>
      </View>
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
  retry: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
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
  lede: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.navyMuted },
  panel: {
    backgroundColor: color.whiteCrisp,
    marginTop: space.s3,
    marginHorizontal: space.s3,
    padding: space.s5,
    gap: space.s2,
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
  muted: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  docKind: { fontFamily: font.display, fontSize: 18, color: color.ink, letterSpacing: 0.3 },
  docLine: { fontFamily: font.body, fontSize: 14, color: color.ink },
  docMeta: { fontFamily: font.mono, fontSize: 11, color: color.inkSoft },
  stateVerified: { fontFamily: font.body, fontSize: 13, fontWeight: "600", color: color.brassText },
  stateSelf: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  rowActions: { flexDirection: "row", gap: space.s3, marginTop: space.s2 },
  btnGhostSmall: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    minHeight: 40,
    paddingHorizontal: space.s4,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: color.inkSoft,
    textTransform: "uppercase",
    marginTop: space.s3,
  },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  kindChip: {
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    minHeight: 40,
    justifyContent: "center",
  },
  kindChipOn: { borderColor: color.brass, backgroundColor: color.boardBg },
  kindChipText: { fontFamily: font.body, fontSize: 13, color: color.ink },
  kindChipTextOn: { color: color.brassText, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
    minHeight: 44,
    paddingHorizontal: space.s3,
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
  },
  error: { fontFamily: font.body, fontSize: 13, color: color.brassText, paddingHorizontal: space.s5, paddingTop: space.s2 },
  sources: { gap: space.s3, marginTop: space.s3 },
  btnBrass: {
    backgroundColor: color.brassText,
    borderRadius: radius,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnBrassText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: "#ffffff" },
  btnGhost: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: color.brassText },
  btnDisabled: { opacity: 0.5 },
  finePrint: { fontFamily: font.body, fontSize: 12, color: color.inkSoft, marginTop: space.s2 },
});
