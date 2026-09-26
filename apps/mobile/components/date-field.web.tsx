import { View } from "react-native";
import { localIsoDate } from "../lib/request-form";
import { color, font, radius, space } from "../lib/tokens";

/* Trip-date field — WEB implementation. The native module
   (@react-native-community/datetimepicker) renders NOTHING on web, so this
   platform file substitutes the browser's own date input: same contract as
   date-field.tsx (YYYY-MM-DD in/out, today floor, no callback on cancel —
   clearing the input keeps the last date, mirroring a dismissed native
   dialog). Keep Props mirrored with date-field.tsx. */

export type DateFieldProps = {
  /** Selected date, strict YYYY-MM-DD. */
  value: string;
  /** Stable minimum date for the mount (the form's today floor). */
  todayFloor: Date;
  /** Called with YYYY-MM-DD only on a real selection — never on cancel. */
  onPick: (iso: string) => void;
};

export function DateField({ value, todayFloor, onPick }: DateFieldProps) {
  return (
    <View style={{ alignSelf: "flex-start" }}>
      <input
        type="date"
        aria-label="Trip date"
        value={value}
        min={localIsoDate(todayFloor)}
        onChange={(e) => {
          const picked = e.target.value;
          if (picked) onPick(picked);
        }}
        style={{
          fontFamily: font.mono,
          fontSize: 14,
          color: color.ink,
          backgroundColor: color.whiteCrisp,
          border: `1px solid ${color.lineStrong}`,
          borderRadius: radius,
          padding: `${space.s2}px ${space.s3}px`,
          minHeight: 44,
        }}
      />
    </View>
  );
}
