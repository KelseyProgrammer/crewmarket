import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { color, font } from "../../../lib/tokens";

/* Board / Bookings / Account tab bar (slice 3, Task 5). Navy bar with a brass
   active tint and the same masthead wordmark as the header band — the Brass
   Ledger's display accent (brass on navy is Brass Bright; root DESIGN.md).
   Fonts load once in the root _layout; this navigator only styles chrome. A
   small brass dot stands in for per-tab icons (intentionally minimal). */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.navyDeep },
        headerTintColor: color.whiteCrisp,
        headerShadowVisible: false,
        headerTitle: () => <Wordmark />,
        tabBarStyle: {
          backgroundColor: color.navyDeep,
          borderTopColor: color.brassEngrave,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: color.brassBright,
        tabBarInactiveTintColor: color.mist,
        tabBarLabelStyle: { fontFamily: font.display, fontSize: 11, letterSpacing: 0.8 },
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: focused ? color.brassBright : "transparent",
              borderWidth: focused ? 0 : 1,
              borderColor: color.mist,
            }}
          />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Board", tabBarLabel: "BOARD" }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarLabel: "BOOKINGS" }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarLabel: "ACCOUNT" }} />
    </Tabs>
  );
}

// The web masthead wordmark: "CREW" white, "MARKET" Brass Bright.
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
