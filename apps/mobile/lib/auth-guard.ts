export type AuthGuardState = "CHECKING" | "SIGNED_IN" | "SIGNED_OUT" | "UNKNOWN";

/** Pure gate decision for auth-required screens. SIGNED_OUT is only the
 *  authoritative answer (get-session succeeded and said no session); a failed
 *  fetch is UNKNOWN — a valid session may still sit in SecureStore, so callers
 *  must never redirect to sign-in on it (9/16 device finding: Expo Go JS reload
 *  after the Stripe Checkout browser + one transient boot-time fetch failure
 *  booted a signed-in user). */
export function authGuardState(args: {
  isPending: boolean;
  session: unknown;
  error: unknown;
}): AuthGuardState {
  if (args.isPending) return "CHECKING";
  if (args.session) return "SIGNED_IN";
  if (args.error) return "UNKNOWN";
  return "SIGNED_OUT";
}

/** Pure redirect decision for the Account screen, called under useFocusEffect
 *  (focus is the hook's job — tab screens stay mounted while unfocused, and an
 *  unfocused redirect would hijack navigation; 10/7 device finding). Redirect
 *  only on the authoritative SIGNED_OUT answer, and never mid-sign-out: the
 *  sign-out handler routes home itself and resets the latch in finally. */
export function shouldRedirectToSignIn(args: {
  gate: AuthGuardState;
  signingOut: boolean;
}): boolean {
  return args.gate === "SIGNED_OUT" && !args.signingOut;
}
