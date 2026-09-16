import { ActivityIndicator, View } from "react-native";
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

  // The (tabs) group owns its own navy header + wordmark and the tab bar; the
  // root stack shows the shared navy header for everything pushed OVER the tabs
  // (crew profile, sign-in/up auto-register file-based; the voyage ledger detail
  // pushes with a back button). The old header account entry is gone — the
  // Account tab replaces it.
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
