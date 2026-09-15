export type Me = { id: string; accountType: string; claimedProfileId: string | null };
export type ClaimButtonState = "SIGNED_OUT" | "HIDDEN" | "CLAIMABLE" | "OWNED";

/** Pure UI decision for the profile-screen claim button (M-2: claiming is opt-in). */
export function claimButtonState(me: Me | null, profileId: string): ClaimButtonState {
  if (!me) return "SIGNED_OUT";
  if (me.accountType !== "CREW") return "HIDDEN";
  if (me.claimedProfileId === profileId) return "OWNED";
  if (me.claimedProfileId) return "HIDDEN"; // drives a different profile
  return "CLAIMABLE";
}
