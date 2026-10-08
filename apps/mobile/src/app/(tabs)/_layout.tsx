import { Tabs } from "expo-router";
import { Text } from "react-native";
import { color, font } from "../../../lib/tokens";
import { BoardGlyph, HelmGlyph, LogbookGlyph } from "../../../components/engravings";

/* Board / Bookings / Account tab bar (slice 3, Task 5). Navy bar with a brass
   active tint and the same masthead wordmark as the header band — the Brass
   Ledger's display accent (brass on navy is Brass Bright; root DESIGN.md).
   Fonts load once in the root _layout; this navigator only styles chrome.
   10/7 polish pass: placeholder dots replaced with chart-room engraved glyphs
   (board plate / ship's log / helm — mist at rest, Brass Bright active) and
   tab labels moved from Oswald to Martian Mono (Data-Is-Mono: labels are
   mono; Oswald never drops below title size). */
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
        tabBarLabelStyle: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Board",
          tabBarLabel: "BOARD",
          tabBarIcon: ({ color: tint }) => <BoardGlyph size={23} stroke={tint} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarLabel: "BOOKINGS",
          tabBarIcon: ({ color: tint }) => <LogbookGlyph size={23} stroke={tint} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarLabel: "ACCOUNT",
          tabBarIcon: ({ color: tint }) => <HelmGlyph size={23} stroke={tint} />,
        }}
      />
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
