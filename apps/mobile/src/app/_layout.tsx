import { ActivityIndicator, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useFonts, Oswald_500Medium, Oswald_700Bold } from "@expo-google-fonts/oswald";
import { Archivo_400Regular } from "@expo-google-fonts/archivo";
import { MartianMono_400Regular } from "@expo-google-fonts/martian-mono";
import { color, font } from "../../lib/tokens";

// Navy header band matching the weigh-in board world (docs/DESIGN.md). Screen
// content (board, crew profile plate) supplies its own titles; this header
// stays small and consistent across the stack.
//
// Fonts hoisted here so useFonts runs exactly once for the whole app.
// Oswald_700Bold carries the web system's Display Banner/Hero weight — used
// by the board banner and the profile name; Archivo_600SemiBold remains
// unreferenced and stays dropped.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Oswald_500Medium,
    Oswald_700Bold,
    Archivo_400Regular,
    MartianMono_400Regular,
  });

  // fontError still lets the app proceed on system fonts instead of hanging
  // forever on a font-loading failure (e.g. a flaky asset fetch) — a
  // slightly-off typeface beats a permanently blank screen.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.navyDeep }}>
        <ActivityIndicator color={color.whiteCrisp} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: color.navyDeep },
        headerTintColor: color.whiteCrisp,
        headerTitleStyle: { fontFamily: font.display },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ headerTitle: () => <Wordmark /> }} />
    </Stack>
  );
}

// The web masthead wordmark: "CREW" in white, "MARKET" in Brass Bright — the
// Brass Ledger's display-accent slot (brass on navy is Brass Bright, never a
// background fill).
function Wordmark() {
  return (
    <Text
      style={{ fontFamily: font.display, fontSize: 17, letterSpacing: 1.2, color: color.whiteCrisp }}
      accessibilityRole="header"
    >
      CREW <Text style={{ color: color.brassBright }}>MARKET</Text>
    </Text>
  );
}
