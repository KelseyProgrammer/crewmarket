// Pure credential label helpers — mobile-facing copy (no RN imports).
//
// KIND_LABELS mirrors apps/web/app/account/credentials-section.tsx EXACTLY
// (frozen vocabulary) so mobile and web read identically. If the web map
// changes, mirror it here. State copy is about the DOCUMENT, never the
// person's competence (V-1 visual distinction, V-3 wording).
import { Credential } from "@crewmarket/types";

export const CREDENTIAL_KINDS = Credential.shape.kind.options;

export const KIND_LABELS: Record<string, string> = {
  USCG_OUPV: "USCG OUPV (6-pack)",
  USCG_MASTER_25_50_100: "USCG Master",
  STCW_BASIC: "STCW Basic Training",
  CPR_FIRST_AID: "CPR / First Aid",
  TWIC: "TWIC",
  STATE_CHARTER_LICENSE: "State Charter License",
  OTHER: "Other credential",
};

/** User-facing label for a credential kind; unknown kinds fall back to the raw key. */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** Mirrors the web credentials section exactly — the brass seal is earned, never self-set (V-1). */
export function stateLabel(verified: boolean): string {
  return verified ? "Verified — document reviewed" : "Self-reported — awaiting review";
}
