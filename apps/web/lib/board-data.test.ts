import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: {} }));
vi.mock("./credential-overrides", () => ({
  credentialOverrideMap: vi.fn(async () => new Map([["p-1", [{ kind: "STCW_BASIC", verified: true }]]])),
}));
const { mergeBoard } = await import("./board-data");

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
