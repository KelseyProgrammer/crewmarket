import { Alert } from "react-native";

/* Destructive-action confirm — NATIVE implementation (Alert.alert, same
   dialog the slice-4 device pass verified). Platform split because RN-web's
   Alert is a silent no-op for button dialogs: confirm.web.ts routes through
   window.confirm instead. Keep ConfirmSpec mirrored in confirm.web.ts. */

export type ConfirmSpec = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

/** Resolves true only on an explicit confirm; cancel/dismiss resolve false. */
export function confirmDestructive(spec: ConfirmSpec): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      spec.title,
      spec.message,
      [
        { text: spec.cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: spec.confirmLabel, style: "destructive", onPress: () => resolve(true) },
      ],
      // Android back/outside-tap dismisses without a button press.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
