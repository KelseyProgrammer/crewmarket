import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: {} }));
vi.mock("./credential-overrides", () => ({
  credentialOverrideMap: vi.fn(async () => new Map([["p-1", [{ kind: "STCW_BASIC", verified: true }]]])),
}));
const { mergeBoard, toPublicProfile } = await import("./board-data");

describe("mergeBoard — the one board-assembly source (web page + mobile API)", () => {
  const seed = [
    { id: "p-1", displayName: "A", credentials: [{ kind: "TWIC", verified: false }] },
    { id: "p-2", displayName: "B", credentials: [{ kind: "TWIC", verified: false }] },
  ] as never[];
  it("replaces credentials for overridden profiles, passes others through untouched", () => {
    const map = new Map([["p-1", [{ kind: "STCW_BASIC", verified: true }]]]);
    const board = mergeBoard(seed, map as never);
    expect(board[0].credentials).toEqual([{ kind: "STCW_BASIC", verified: true }]);
    expect(board[1]).toBe(seed[1]); // untouched object, not a copy
  });
  it("empty override map returns the seed as-is", () => {
    expect(mergeBoard(seed, new Map())).toEqual(seed);
  });
});

describe("toPublicProfile — public allowlist (P-4)", () => {
  it("strips never-rendered fields and passes rendered ones", () => {
    const p = toPublicProfile({
      id: "x", displayName: "N", roles: ["MATE"], homePort: "Key West, FL",
      regions: ["Lower Keys"], yearsExperience: 5, fisheries: ["sailfish"],
      vesselExperience: ["express"], dayRateUsd: 300, bio: "b",
      credentials: [], availability: [],
      stats: { tripsCompleted: 10, avgRating: 4.9, responseRate: 0.99 },
      photoRefs: ["ref"],
    } as never);
    expect(p.stats).toEqual({ tripsCompleted: 10 });
    expect("photoRefs" in p).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/avgRating|responseRate|photoRefs/);
  });
  it("wire contract is frozen — apps/mobile/lib/board.ts hand-types this exact key set", () => {
    const p = toPublicProfile({
      id: "x", displayName: "N", roles: ["MATE"], homePort: "Key West, FL",
      regions: ["Lower Keys"], yearsExperience: 5, fisheries: ["sailfish"],
      vesselExperience: ["express"], dayRateUsd: 300, halfDayRateUsd: 195,
      tournamentRateUsd: 480, bio: "b", credentials: [], availability: [],
      stats: { tripsCompleted: 10 },
    } as never);
    // Changing this list is a BREAKING mobile change — update BoardProfile in
    // apps/mobile/lib/board.ts in the same commit.
    expect(Object.keys(p).sort()).toEqual([
      "availability", "bio", "credentials", "dayRateUsd", "displayName",
      "fisheries", "halfDayRateUsd", "homePort", "id", "regions", "roles",
      "stats", "tournamentRateUsd", "vesselExperience", "yearsExperience",
    ]);
  });
});
