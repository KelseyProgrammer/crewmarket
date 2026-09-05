import "server-only";
import type { CrewCardData } from "@crewmarket/ui";
import seed from "../data/seed-crew.json";
import { credentialOverrideMap, type PublicCredential } from "./credential-overrides";

/* The one board-assembly source: the directory page and GET /api/board must
   never disagree about what the public sees (V-1 board/profile agreement;
   V-2 — only PublicCredential fields ever cross this boundary). */

export function mergeBoard(
  profiles: CrewCardData[],
  overrides: Map<string, PublicCredential[]>
): CrewCardData[] {
  return profiles.map((c) =>
    overrides.has(c.id) ? { ...c, credentials: overrides.get(c.id)! as CrewCardData["credentials"] } : c
  );
}

export async function boardData(): Promise<CrewCardData[]> {
  const all = seed.profiles as unknown as CrewCardData[];
  return mergeBoard(all, await credentialOverrideMap());
}
