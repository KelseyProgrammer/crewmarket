import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { signIn } from "../../lib/auth-client";
import { color, font, radius, space } from "../../lib/tokens";

/* Sign-in screen (slice 2, Task 6). Mirrors apps/web/components/auth-forms.tsx
   SignInForm — email + password, inline error, marketplace vocabulary only (M-1). */

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    if (pending) return;
    setError(null);
    setPending(true);
    const { error: err } = await signIn.email({ email, password });
    if (err) {
      setError(
        err.status === 401
          ? "That email and password don't match a registry account."
          : (err.message ?? "Could not sign in. Try again."),
      );
      setPending(false);
      return;
    }
    router.replace("/account");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Sign in" }} />

      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          SIGN IN
        </Text>
        <Text style={styles.subtitle}>Welcome back to the registry.</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
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
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!pending}
            placeholder="Your password"
            placeholderTextColor={color.inkSoft}
          />
        </View>

        {error && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorLabel}>COULD NOT CONTINUE</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.submit, pending && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={pending}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
        >
          <Text style={styles.submitText}>{pending ? "Signing in…" : "Sign in"}</Text>
        </Pressable>

        <View style={styles.altRow}>
          <Text style={styles.altText}>New here? </Text>
          <Link href="/sign-up" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.altLink}>Create an account</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScrollView>
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
