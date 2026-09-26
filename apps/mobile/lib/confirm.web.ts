/* Destructive-action confirm — WEB implementation. RN-web's Alert.alert is a
   silent no-op for button dialogs (the credentials Remove button did nothing
   on web), so the browser's own confirm dialog stands in. Button labels come
   from the browser; confirmLabel/cancelLabel exist to keep the ConfirmSpec
   contract mirrored with confirm.ts (native). */

export type ConfirmSpec = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

/** Resolves true only on an explicit confirm; cancel/dismiss resolve false. */
export function confirmDestructive(spec: ConfirmSpec): Promise<boolean> {
  return Promise.resolve(window.confirm(`${spec.title}\n\n${spec.message}`));
}
