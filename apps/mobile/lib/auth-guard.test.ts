import { describe, expect, it } from "vitest";
import { authGuardState, shouldRedirectToSignIn } from "./auth-guard";

const session = { user: { id: "u1" } };
const error = { status: 0, message: "Network request failed" };

describe("authGuardState", () => {
  it("is CHECKING while the session fetch is pending", () => {
    expect(authGuardState({ isPending: true, session: null, error: null })).toBe("CHECKING");
  });

  it("is SIGNED_IN when a session is present", () => {
    expect(authGuardState({ isPending: false, session, error: null })).toBe("SIGNED_IN");
  });

  it("stays SIGNED_IN when a session is present even if a background refetch errored", () => {
    expect(authGuardState({ isPending: false, session, error })).toBe("SIGNED_IN");
  });

  it("is SIGNED_OUT only when get-session succeeded with no session (authoritative)", () => {
    expect(authGuardState({ isPending: false, session: null, error: null })).toBe("SIGNED_OUT");
  });

  // Regression: device pass 9/16 — Expo Go JS reload after Stripe Checkout return;
  // boot-time get-session failed transiently (data null + error set) and the old
  // `!isPending && !session` guards booted a signed-in user to /sign-in.
  it("is UNKNOWN (never SIGNED_OUT) when the session fetch errored with no data", () => {
    expect(authGuardState({ isPending: false, session: null, error })).toBe("UNKNOWN");
  });

  it("is CHECKING while pending even if a previous attempt left an error", () => {
    expect(authGuardState({ isPending: true, session: null, error })).toBe("CHECKING");
  });
});

// Regression: device pass 10/7 — sign-out "freeze". signOut() succeeded and the
// screen routed home, but the still-mounted Account tab never reset its
// signingOut latch, so revisiting the tab spun forever (redirect suppressed,
// session gone). The redirect decision is now a pure call made under
// useFocusEffect (focus handled by the hook, not an argument here).
describe("shouldRedirectToSignIn", () => {
  it("redirects on the authoritative SIGNED_OUT answer when not signing out", () => {
    expect(shouldRedirectToSignIn({ gate: "SIGNED_OUT", signingOut: false })).toBe(true);
  });

  it("never redirects mid-sign-out (the handler routes home itself)", () => {
    expect(shouldRedirectToSignIn({ gate: "SIGNED_OUT", signingOut: true })).toBe(false);
  });

  it("never redirects while CHECKING", () => {
    expect(shouldRedirectToSignIn({ gate: "CHECKING", signingOut: false })).toBe(false);
  });

  it("never redirects on UNKNOWN (failed fetch is not authoritative)", () => {
    expect(shouldRedirectToSignIn({ gate: "UNKNOWN", signingOut: false })).toBe(false);
  });

  it("never redirects when signed in", () => {
    expect(shouldRedirectToSignIn({ gate: "SIGNED_IN", signingOut: false })).toBe(false);
  });
});
