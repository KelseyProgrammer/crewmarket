// Wire types + fetch/filter logic for GET /api/board.
//
// Mirrors the allowlisted shape apps/web/lib/board-data.ts's toPublicProfile()
// actually sends (read that file before touching this one) — NOT the full
// internal seed shape. avgRating, responseRate, and photoRefs are stripped
// server-side on purpose (P-4: no ratings-as-ranks; V-2: minimal surface) and
// must never be added back here.
//
// Extended to the full field list in one pass (not just the board-row subset)
// because the profile screen (slice 1 Task 4) reuses this type and the
// module-level cache below.

import { API_URL } from "./api";

export type BoardCredential = {
  kind: string;
  licenseClass?: string;
  expiresAt?: string;
  verified?: boolean;
};

export type BoardAvailability = { date: string; status: string };

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
  credentials: BoardCredential[];
  availability: BoardAvailability[];
  stats: { tripsCompleted: number };
};

export async function fetchBoard(): Promise<BoardProfile[]> {
  const res = await fetch(`${API_URL}/api/board`);
  if (!res.ok) throw new Error(`board fetch failed: ${res.status}`);
  const json = (await res.json()) as { profiles: BoardProfile[] };
  return json.profiles;
}

export type BoardFilters = { role: string; port: string; date: string; verifiedOnly: boolean };

export const EMPTY_FILTERS: BoardFilters = { role: "", port: "", date: "", verifiedOnly: false };

/* Same semantics as apps/web/app/directory/page.tsx's inline filter — keep in
   lockstep; a date absent from a profile's availability list is closed,
   never assumed open (M-2). */
export function filterBoard(profiles: BoardProfile[], f: BoardFilters): BoardProfile[] {
  return profiles.filter((c) => {
    if (f.role && !c.roles.includes(f.role)) return false;
    if (f.port && c.homePort !== f.port) return false;
    if (f.date && !c.availability.some((a) => a.date === f.date && a.status === "OPEN")) return false;
    if (f.verifiedOnly && !c.credentials.some((cr) => cr.verified)) return false;
    return true;
  });
}

/* Earliest seeded availability date across the whole board — deterministic,
   never new Date(). Matches apps/web/app/directory/page.tsx's `windowStart`.
   Used to anchor the 14-day availability strip and the date filter chips. */
export function boardWindowStart(profiles: BoardProfile[]): string | undefined {
  return profiles
    .flatMap((c) => c.availability.map((a) => a.date))
    .sort()[0];
}

/* Fetch the board once, cache in memory. The profile screen (Task 4) reads
   this cache first and only calls fetchBoard() itself on a cold-start deep
   link (no board fetch has happened yet in this app session). */
let boardCache: BoardProfile[] | null = null;

export async function getBoard(): Promise<BoardProfile[]> {
  if (boardCache) return boardCache;
  const profiles = await fetchBoard();
  boardCache = profiles;
  return profiles;
}

export function cachedBoard(): BoardProfile[] | null {
  return boardCache;
}
