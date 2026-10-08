import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { color, font, radius, space } from "../lib/tokens";

/* The brass primary action — ONE idiom: display caps on a Brass Text fill
   (the booking CTA's treatment, DESIGN.md Buttons: "one primary action per
   screen"). Extracted 10/7 after the audit found the button hand-rolled in
   two competing treatments across five call sites. Press deepens the fill
   to brass-text-hover, the web hover spec. */
export function BrassButton({
  label,
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: color.brassText,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
  },
  btnPressed: { backgroundColor: color.brassTextPress },
  btnDisabled: { opacity: 0.5 },
  label: {
    fontFamily: font.display,
    fontSize: 15,
    color: color.whiteCrisp,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
});
