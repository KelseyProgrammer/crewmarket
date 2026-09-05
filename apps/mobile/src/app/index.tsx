import { StyleSheet, Text, View } from "react-native";

// Placeholder screen for the Expo scaffold (slice 1, Task 2). Task 3 replaces
// this with the live crew board (fetches GET /api/board, four SOW filters).
export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Crew Market — board coming in this build</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  text: { fontSize: 16, textAlign: "center" },
});
