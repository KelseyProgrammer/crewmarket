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
