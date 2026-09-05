// Type-only import proves the `@crewmarket/types` workspace dependency resolves
// through pnpm's workspace link (see apps/mobile/package.json). Task 3's
// lib/board.ts will lean on the shared shapes from this package for real.
import type { CrewProfile } from "@crewmarket/types";

export type _WorkspaceLinkProof = CrewProfile;

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/* Browser-facing origin for handoff links (booking CTA). Defaults to the API
   origin — today one Next.js server serves both — but they are different
   concerns: split EXPO_PUBLIC_WEB_URL from EXPO_PUBLIC_API_URL the moment the
   API moves behind its own host. */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? API_URL;
