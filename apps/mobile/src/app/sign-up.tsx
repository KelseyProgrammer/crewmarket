import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { DisclaimerD2 } from "../../components/disclaimer-d2";
import { signUp } from "../../lib/auth-client";
import { color, font, radius, space } from "../../lib/tokens";

/* Create-account screen (slice 2, Task 6). Mirrors apps/web/components/auth-forms.tsx
   SignUpForm intent-for-intent: the CREW/BOAT fork, the required verbatim D-2
   checkbox (docs/COMPLIANCE.md), marketplace vocabulary only (M-1). Crew is the
   default — the mobile app is crew-first. */

const ACCOUNT_OPTIONS = [
  {
    value: "CREW",
    label: "Crew account",
    desc: "List your services and set your own rates. Accept or decline any booking — no penalties.",
  },
  {
    value: "BOAT",
    label: "Boat account",
    desc: "Book credentialed crew. Payment is held until the trip is done and reviewed.",
  },
] as const;

export default function SignUpScreen() {
  const router = useRouter();
  const [role, setRole] = useState<"CREW" | "BOAT">("CREW");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = accepted && !pending;

  async function onSubmit() {
    if (!accepted || pending) return;
    setError(null);
    setPending(true);
    // Built as a variable (not an object literal) so accountType/disclaimerAccepted —
    // additional user fields the API defines — pass through without tripping
    // excess-property checking on the base signUp.email payload type.
    const payload = { name, email, password, accountType: role, disclaimerAccepted: true };
    const { error: err } = await signUp.email(payload);
    if (err) {
      setError(err.message ?? "Could not create the account. Check the fields and try again.");
      setPending(false);
      return;
    }
    router.replace("/account");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Create an account" }} />

      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          CREATE AN ACCOUNT
        </Text>
        <Text style={styles.subtitle}>Join the registry as crew or as a boat.</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.fork} accessibilityRole="radiogroup">
          {ACCOUNT_OPTIONS.map((opt) => {
            const active = role === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.forkPlate, active && styles.forkPlateActive]}
                onPress={() => setRole(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.forkName, active && styles.forkNameActive]}>{opt.label}</Text>
                <Text style={styles.forkDesc}>{opt.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field label={role === "CREW" ? "Name as listed" : "Your name"}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            editable={!pending}
            placeholder="Full name"
            placeholderTextColor={color.inkSoft}
          />
        </Field>
        <Field label="Email">
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            editable={!pending}
            placeholder="you@example.com"
            placeholderTextColor={color.inkSoft}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!pending}
            placeholder="Choose a password"
            placeholderTextColor={color.inkSoft}
          />
        </Field>

        {/* Rule D-2: signup checkbox placement. The prefix labels the acknowledgement;
            the disclaimer copy itself comes verbatim from <DisclaimerD2 />. Submission
            is blocked until the box is checked. */}
        <Pressable
          style={styles.disclaimerRow}
          onPress={() => setAccepted((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.disclaimerCopy}>
            <Text style={styles.disclaimerPrefix}>I understand the following:</Text>
            <DisclaimerD2 />
          </View>
        </Pressable>

        {error && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorLabel}>COULD NOT CONTINUE</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
        >
          <Text style={styles.submitText}>
            {pending
              ? "Creating account…"
              : role === "CREW"
                ? "Create account & offer services"
                : "Create account & book crew"}
          </Text>
        </Pressable>

        <View style={styles.altRow}>
          <Text style={styles.altText}>Already on the registry? </Text>
          <Link href="/sign-in" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.altLink}>Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  content: { paddingBottom: space.s7 },
  head: {
    backgroundColor: color.navyDeep,
    padding: space.s5,
    gap: space.s2,
    borderBottomWidth: 1,
    borderBottomColor: color.brassEngrave,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 28,
    lineHeight: 30,
    color: color.whiteCrisp,
    letterSpacing: 0.4,
  },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.navyMuted },

  form: { padding: space.s3, gap: space.s4 },

  fork: { gap: space.s3 },
  forkPlate: {
    backgroundColor: color.whiteCrisp,
    padding: space.s4,
    gap: space.s1,
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
  },
  forkPlateActive: { borderColor: color.brass, borderWidth: 2 },
  forkName: { fontFamily: font.display, fontSize: 16, color: color.ink, letterSpacing: 0.3 },
  forkNameActive: { color: color.brassText },
  forkDesc: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.inkSoft },

  field: { gap: space.s2, paddingHorizontal: space.s1 },
  fieldLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: color.inkSoft,
    textTransform: "uppercase",
  },
  input: {
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.whiteCrisp,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius,
    paddingHorizontal: space.s3,
    minHeight: 44,
  },
  fieldHint: { fontFamily: font.body, fontSize: 12, color: color.inkSoft },

  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.s3,
    paddingHorizontal: space.s1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.s5, // aligns roughly with the prefix line under DisclaimerD2's top padding
    backgroundColor: color.whiteCrisp,
  },
  checkboxChecked: { backgroundColor: color.brassText, borderColor: color.brassText },
  checkmark: { fontFamily: font.body, fontSize: 15, lineHeight: 18, color: "#ffffff", fontWeight: "700" },
  disclaimerCopy: { flex: 1 },
  disclaimerPrefix: {
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: "600",
    color: color.ink,
    paddingHorizontal: space.s4,
    paddingTop: space.s5,
  },

  errorBox: {
    marginHorizontal: space.s1,
    padding: space.s4,
    gap: space.s1,
    backgroundColor: color.whiteCrisp,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderLeftWidth: 3,
    borderLeftColor: color.brass,
    borderRadius: radius,
  },
  errorLabel: { fontFamily: font.mono, fontSize: 10, letterSpacing: 0.8, color: color.brassText },
  errorText: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.ink },

  submit: {
    marginHorizontal: space.s1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: color.brassText,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontFamily: font.body, fontSize: 15, fontWeight: "600", color: "#ffffff" },

  altRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  altText: { fontFamily: font.body, fontSize: 14, color: color.inkSoft },
  altLink: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
});
