import * as WebBrowser from "expo-web-browser";

/* Open an external URL (Stripe Checkout, a presigned doc) — NATIVE
   implementation (expo-web-browser's in-app browser, exactly what slices 3-4
   verified). Platform split because on web a popup opened AFTER an awaited
   fetch is blocked by the browser: open-external.web.ts grabs the tab
   synchronously inside the click gesture. Shared contract:

     const opener = beginExternalOpen();   // call FIRST, before any await
     ... await fetch for the url ...
     if (failed) { opener.cancel(); return; }
     await opener.open(url);               // resolves when the user returns

   open() resolving on return lets the caller's confirm-poll run at the right
   moment on both platforms (native: browser dismissed; web: tab closed or
   refocused). Keep this contract mirrored in open-external.web.ts. */

export type ExternalOpener = {
  /** Navigate to the URL; resolves when the user comes back. */
  open: (url: string) => Promise<void>;
  /** Abandon the open (e.g. the URL fetch failed). */
  cancel: () => void;
};

export function beginExternalOpen(): ExternalOpener {
  return {
    open: async (url: string) => {
      await WebBrowser.openBrowserAsync(url);
    },
    cancel: () => {},
  };
}
