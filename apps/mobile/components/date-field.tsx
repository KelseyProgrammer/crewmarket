import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { localIsoDate } from "../lib/request-form";
import { color, font, radius, space } from "../lib/tokens";

/* Trip-date field — NATIVE implementation. Redesigned in design-polish batch 2
   (10/7): the iOS compact picker's system-grey chip can't be branded (Apple
   tertiarySystemFill), so the FIELD is now ours — a registry plate with the
   date as mono-caps data furniture and a brass CHANGE affordance — while the
   calendar stays Apple's: tapping expands an inline picker (brass accent)
   that collapses itself on selection. Android keeps the system dialog behind
   the same branded field. date-field.web.tsx renders <input type="date">
   instead (the RN picker silently renders nothing on web); mirror any Props
   change there. */

export type DateFieldProps = {
  /** Selected date, strict YYYY-MM-DD. */
  value: string;
  /** Stable minimum date for the mount (the form's today floor). */
  todayFloor: Date;
  /** Called with YYYY-MM-DD only on a real selection — never on cancel. */
  onPick: (iso: string) => void;
};

// Registry-voice date: "TUE, OCT 7, 2026" (mono caps, like the board's
// NEXT OPEN furniture — Data-Is-Mono).
function fmtFieldDate(iso: string) {
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

export function DateField({ value, todayFloor, onPick }: DateFieldProps) {
  const [open, setOpen] = useState(false); // iOS inline calendar expanded
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  // "set" only: Android fires onChange with the fallback value on dismiss too —
  // a cancelled dialog must never write a date into a funds-hold request.
  // iOS: a real selection also collapses the calendar (the old compact popover
  // stayed open after a pick — the device-pass finding this field replaces).
  const onPickDate = useCallback(
    (event: DateTimePickerEvent, picked?: Date) => {
      setShowAndroidPicker(false);
      if (event.type === "set" && picked) {
        setOpen(false);
        onPick(localIsoDate(picked));
      }
    },
    [onPick],
  );

  const pickerValue = new Date(value + "T00:00:00");
  const ios = Platform.OS === "ios";

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.field, open && styles.fieldOpen]}
        onPress={() => (ios ? setOpen((o) => !o) : setShowAndroidPicker(true))}
        accessibilityRole="button"
        accessibilityState={ios ? { expanded: open } : undefined}
        accessibilityLabel={`Trip date, ${fmtFieldDate(value)}. Opens a calendar.`}
      >
        <Text style={styles.fieldDate}>{fmtFieldDate(value)}</Text>
        {/* Link-grade brass on white (DESIGN.md: Brass Text carries links). */}
        <Text style={styles.fieldAction}>{ios && open ? "DONE" : "CHANGE"}</Text>
      </Pressable>
      {ios && open && (
        <View style={styles.calendarPlate}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="inline"
            minimumDate={todayFloor}
            accentColor={color.brassText}
            themeVariant="light"
            onChange={onPickDate}
          />
        </View>
      )}
      {!ios && showAndroidPicker && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          minimumDate={todayFloor}
          onChange={onPickDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2, alignSelf: "stretch" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s3,
    minHeight: 48,
    paddingVertical: space.s3,
    paddingHorizontal: space.s3,
    backgroundColor: color.whiteCrisp,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius,
  },
  // Open state warms the edge to brass — the focus idiom, not a new meaning.
  fieldOpen: { borderColor: color.brass },
  fieldDate: { fontFamily: font.mono, fontSize: 14, letterSpacing: 0.4, color: color.ink },
  fieldAction: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: color.brassText,
  },
  // The expanded calendar sits on its own white plate, hairline-edged like
  // every other plate on the board ground.
  calendarPlate: {
    backgroundColor: color.whiteCrisp,
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
    paddingHorizontal: space.s2,
  },
});
