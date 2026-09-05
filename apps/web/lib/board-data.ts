import "server-only";
import type { CrewCardData } from "@crewmarket/ui";
import seed from "../data/seed-crew.json";
import { credentialOverrideMap, type PublicCredential } from "./credential-overrides";

/* The one board-assembly source: the directory page and GET /api/board must
   never disagree about what the public sees (V-1 board/profile agreement;
   V-2 — only PublicCredential fields ever cross this boundary). */

/* Wider than CrewCardData on purpose: the directory board only needs
   CrewCardData's fields, but apps/web/app/crew/[id]/page.tsx renders more of
   the seed (regions, vesselExperience, bio, half-day/tournament rates) and
   the seed itself also carries fields NEITHER page renders (photoRefs,
   stats.avgRating, stats.responseRate). This type is the actual seed/module
   shape so toPublicProfile below can see everything and choose what leaves
   the server. */
export type BoardProfile = {
  id: string;
  displayName: string;
  roles: string[];
  homePort: string;
  regions: string[];
  yearsExperience: number;
  fisheries: string[];
  vesselExperience: string[];
  dayRateUsd: number;
  halfDayRateUsd?: number;
  tournamentRateUsd?: number;
  bio: string;
  photoRefs?: string[];
  credentials: CrewCardData["credentials"];
  availability: CrewCardData["availability"];
  stats: { tripsCompleted: number; avgRating?: number; responseRate?: number };
};

/* mergeBoard passes untouched profiles through as shared references into the
   module-level seed array (see the `return c` branch below) — never mutate
   the objects it returns. boardData()'s projection (toPublicProfile) copies
   every field it keeps into a new object, so its output is safe to hand to
   callers/serialize even though mergeBoard's own output isn't. */
export function mergeBoard(
  profiles: BoardProfile[],
  overrides: Map<string, PublicCredential[]>
): BoardProfile[] {
  return profiles.map((c) =>
    overrides.has(c.id) ? { ...c, credentials: overrides.get(c.id)! as BoardProfile["credentials"] } : c
  );
}

/* Public projection (P-4/M-2): the feed carries exactly what the web renders —
   nothing more. stats.avgRating/responseRate exist in seed but are deliberately
   never rendered (no ratings-as-ranks); they must not leak through this API for
   a future client to build a leaderboard on. Allowlist, so new seed fields
   don't ship publicly by default. */
export function toPublicProfile(p: BoardProfile) {
  return {
    id: p.id,
    displayName: p.displayName,
    roles: p.roles,
    homePort: p.homePort,
    regions: p.regions,
    yearsExperience: p.yearsExperience,
    fisheries: p.fisheries,
    vesselExperience: p.vesselExperience,
    dayRateUsd: p.dayRateUsd,
    ...(p.halfDayRateUsd !== undefined ? { halfDayRateUsd: p.halfDayRateUsd } : {}),
    ...(p.tournamentRateUsd !== undefined ? { tournamentRateUsd: p.tournamentRateUsd } : {}),
    bio: p.bio,
    credentials: p.credentials,
    availability: p.availability,
    stats: { tripsCompleted: p.stats.tripsCompleted },
  };
}
export type PublicBoardProfile = ReturnType<typeof toPublicProfile>;

export async function boardData(): Promise<PublicBoardProfile[]> {
  const all = seed.profiles as unknown as BoardProfile[];
  // Fail loud on DB failure — a silent seed-only fallback would serve stale
  // verified state (V-1).
  const merged = mergeBoard(all, await credentialOverrideMap());
  return merged.map(toPublicProfile);
}
