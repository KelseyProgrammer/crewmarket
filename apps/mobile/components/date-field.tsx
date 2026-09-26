import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { localIsoDate } from "../lib/request-form";
import { color, font, radius, space } from "../lib/tokens";

/* Trip-date field — NATIVE implementation (iOS compact picker inline; Android
   button → dialog). Extracted verbatim from bookings/new.tsx for the web
   platform split: date-field.web.tsx renders <input type="date"> instead,
   because @react-native-community/datetimepicker silently renders nothing on
   web. Behavior here must stay byte-for-byte with what the slice-5 device
   pass verified. Mirror any Props change in date-field.web.tsx. */

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

  // "set" only: Android fires onChange with the fallback value on dismiss too —
  // a cancelled dialog must never write a date into a funds-hold request.
  const onPickDate = useCallback(
    (event: DateTimePickerEvent, picked?: Date) => {
      setShowAndroidPicker(false);
      if (event.type === "set" && picked) onPick(localIsoDate(picked));
    },
    [onPick],
  );

  const pickerValue = new Date(value + "T00:00:00");

  if (Platform.OS === "ios") {
    return (
      <View style={styles.dateRow}>
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="compact"
          minimumDate={todayFloor}
          onChange={onPickDate}
        />
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
  dateButton: { borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius, paddingVertical: space.s2, paddingHorizontal: space.s3, backgroundColor: color.whiteCrisp, alignSelf: "flex-start" },
  dateButtonText: { fontFamily: font.mono, color: color.ink },
});
