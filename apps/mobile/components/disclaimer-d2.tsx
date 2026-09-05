import { StyleSheet, Text } from "react-native";
import { color, font, space } from "../lib/tokens";

/* Rule D-2: mandatory verbatim disclaimer (docs/COMPLIANCE.md). Placement:
   signup, every profile, booking flow. Text copied VERBATIM from
   packages/ui/src/components.tsx's DisclaimerD2 — this is a compliance
   artifact, byte-identical wording, do not paraphrase or trim. */
export function DisclaimerD2() {
  return (
    <Text style={styles.text}>
      Crew Market is a directory and booking marketplace. We are not an employer, crewing agency, or
      vessel operator. Vessel owners are solely responsible for crew selection, vessel operation, and
      legal compliance including insurance.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkSoft,
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
  },
});
