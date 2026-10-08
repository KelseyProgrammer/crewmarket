import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { localIsoDate } from "../lib/request-form";
import { color, font, radius, space } from "../lib/tokens";

/* Trip-date field — NATIVE implementation (iOS compact picker inline; Android
   button → dialog). Extracted from bookings/new.tsx for the web platform
   split: date-field.web.tsx renders <input type="date"> instead, because
   @react-native-community/datetimepicker silently renders nothing on web.
   Slice-5 device pass (10/7) amendments: the iOS popover is dismissed after a
   pick (key remount — the compact picker has no imperative close), and the
   chip carries a "Tap the date to change it" hint because the bare pill read
   as static text. Mirror any Props change in date-field.web.tsx. */

export type DateFieldProps = {
  /** Selected date, strict YYYY-MM-DD. */
  value: string;
  /** Stable minimum date for the mount (the form's today floor). */
  todayFloor: Date;
  /** Called with YYYY-MM-DD only on a real selection — never on cancel. */
  onPick: (iso: string) => void;
};

export function DateField({ value, todayFloor, onPick }: DateFieldProps) {
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  // iOS compact popover has no close API — remounting the picker dismisses it.
  const [pickerSession, setPickerSession] = useState(0);

  // "set" only: Android fires onChange with the fallback value on dismiss too —
  // a cancelled dialog must never write a date into a funds-hold request.
  const onPickDate = useCallback(
    (event: DateTimePickerEvent, picked?: Date) => {
      setShowAndroidPicker(false);
      if (event.type === "set" && picked) {
        setPickerSession((s) => s + 1);
        onPick(localIsoDate(picked));
      }
    },
    [onPick],
  );

  const pickerValue = new Date(value + "T00:00:00");

  if (Platform.OS === "ios") {
    return (
      <View style={styles.dateRow}>
        <DateTimePicker
          key={pickerSession}
          value={pickerValue}
          mode="date"
          display="compact"
          minimumDate={todayFloor}
          onChange={onPickDate}
        />
        <Text style={styles.dateHint}>Tap the date to change it</Text>
      </View>
    );
  }
  return (
    <>
      <Pressable
        style={styles.dateButton}
        accessibilityRole="button"
        onPress={() => setShowAndroidPicker(true)}
      >
        <Text style={styles.dateButtonText}>{value}</Text>
      </Pressable>
      {showAndroidPicker && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          minimumDate={todayFloor}
          onChange={onPickDate}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  dateRow: { alignSelf: "flex-start" },
  dateHint: { fontFamily: font.body, fontSize: 12, color: color.inkSoft, marginTop: space.s1 },
  dateButton: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s3, backgroundColor: color.whiteCrisp, alignSelf: "flex-start" },
  dateButtonText: { fontFamily: font.mono, color: color.ink },
});
