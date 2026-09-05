import { Stack } from "expo-router";
import { color, font } from "../../lib/tokens";

// Navy header band matching the weigh-in board world (docs/DESIGN.md). Screen
// content (board, and later the crew profile plate) supplies its own titles;
// this header stays small and consistent across the stack.
export default function RootLayout() {
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
