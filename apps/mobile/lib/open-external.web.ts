/* Open an external URL (Stripe Checkout, a presigned doc) — WEB
   implementation. A popup opened after an awaited fetch trips the browser's
   popup blocker, so beginExternalOpen() grabs the tab SYNCHRONOUSLY inside the
   click gesture (blank first, real URL once the fetch returns). open()
   resolves when the user comes back — the popup is closed OR the app tab is
   refocused — so the caller's confirm-poll fires at the right moment, matching
   the native in-app-browser dismiss. Keep the contract mirrored with
   open-external.ts. */

export type ExternalOpener = {
  open: (url: string) => Promise<void>;
  cancel: () => void;
};

export function beginExternalOpen(): ExternalOpener {
  // Synchronous, still inside the click gesture — this is what dodges the
  // blocker. No "noopener": that flag makes window.open return null, and we
  // need the handle to navigate the tab and detect its close.
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  return {
    open: (url: string) =>
      new Promise<void>((resolve) => {
        if (!win) {
          // Popup blocked even synchronously — fall back to a same-tab nav so
          // the user still reaches Stripe (Stripe's success_url returns them).
          window.location.assign(url);
          resolve();
          return;
        }
        win.location.href = url;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearInterval(timer);
          document.removeEventListener("visibilitychange", onVisible);
          resolve();
        };
        // Either signal means "the user is back with us".
        const onVisible = () => {
          if (document.visibilityState === "visible") finish();
        };
        const timer = setInterval(() => {
          if (win.closed) finish();
        }, 500);
        document.addEventListener("visibilitychange", onVisible);
      }),
    cancel: () => {
      if (win && !win.closed) win.close();
    },
  };
}
