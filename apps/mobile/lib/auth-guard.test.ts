import { describe, expect, it } from "vitest";
import { authGuardState } from "./auth-guard";

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
