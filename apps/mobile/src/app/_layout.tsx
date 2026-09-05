import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { useFonts, Oswald_500Medium } from "@expo-google-fonts/oswald";
import { Archivo_400Regular } from "@expo-google-fonts/archivo";
import { MartianMono_400Regular } from "@expo-google-fonts/martian-mono";
import { color, font } from "../../lib/tokens";

// Navy header band matching the weigh-in board world (docs/DESIGN.md). Screen
// content (board, and later the crew profile plate) supplies its own titles;
// this header stays small and consistent across the stack.
//
// Fonts hoisted here (were duplicated per-screen in index.tsx and
// crew/[id].tsx) so useFonts runs exactly once for the whole app and both
// screens share one loading gate. Oswald_700Bold and Archivo_600SemiBold
// were loaded previously but no style in the app references them by name
// (font.ts only maps display/body/mono to the *_500Medium/_400Regular/mono
// weights) — dropped rather than carried forward unused.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Oswald_500Medium,
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
      }}
    >
      <Stack.Screen name="index" options={{ title: "Crew Market" }} />
    </Stack>
  );
}
