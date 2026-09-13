import { afterEach, describe, expect, it, vi } from "vitest";
import { boardWindowStart, filterBoard, EMPTY_FILTERS, type BoardProfile } from "./board";

/* Lockstep guard: these semantics mirror apps/web/app/directory/page.tsx's
   inline filter. M-2: a date absent from availability is closed, never open. */

function profile(over: Partial<BoardProfile>): BoardProfile {
  return {
    id: "x",
    displayName: "X",
    roles: ["MATE"],
    homePort: "Miami, FL",
    regions: [],
    yearsExperience: 1,
    fisheries: [],
    vesselExperience: [],
    dayRateUsd: 100,
    bio: "",
    credentials: [],
    availability: [],
    stats: { tripsCompleted: 0 },
    ...over,
  };
}

const CAPTAIN = profile({
  id: "c",
  roles: ["CAPTAIN"],
  homePort: "Key West, FL",
  credentials: [{ kind: "USCG_OUPV", verified: true }],
  availability: [{ date: "2026-08-28", status: "OPEN" }],
});
const MATE = profile({
  id: "m",
  roles: ["MATE"],
  homePort: "Miami, FL",
  credentials: [{ kind: "TWIC", verified: false }],
  availability: [{ date: "2026-08-29", status: "BOOKED" }],
});
const BOARD = [CAPTAIN, MATE];

describe("filterBoard", () => {
  it("empty filters return the whole board", () => {
    expect(filterBoard(BOARD, EMPTY_FILTERS)).toEqual(BOARD);
  });
  it("role filter", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, role: "CAPTAIN" })).toEqual([CAPTAIN]);
  });
  it("port filter", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, port: "Miami, FL" })).toEqual([MATE]);
  });
  it("date filter: only an explicit OPEN matches", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, date: "2026-08-28" })).toEqual([CAPTAIN]);
  });
  it("date filter M-2: absent and non-OPEN dates are closed", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, date: "2026-08-29" })).toEqual([]);
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, date: "2026-12-25" })).toEqual([]);
  });
  it("verifiedOnly honors only verified === true", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, verifiedOnly: true })).toEqual([CAPTAIN]);
  });
  it("filters combine (AND)", () => {
    expect(
      filterBoard(BOARD, { role: "CAPTAIN", port: "Miami, FL", date: "", verifiedOnly: false }),
    ).toEqual([]);
  });
});

describe("boardWindowStart", () => {
  it("earliest date across all profiles", () => {
    expect(boardWindowStart(BOARD)).toBe("2026-08-28");
  });
  it("undefined on an empty board", () => {
    expect(boardWindowStart([])).toBeUndefined();
  });
});

/* getBoard/fetchBoard hold module-level cache state → fresh module per test.
   The static import above serves the stateless functions; both intentional. */
async function freshBoard() {
  vi.resetModules();
  return import("./board");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBoard", () => {
  it("throws on a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 500)));
    const { fetchBoard } = await freshBoard();
    await expect(fetchBoard()).rejects.toThrow("board fetch failed: 500");
  });
  it("throws on a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ profiles: "nope" })));
    const { fetchBoard } = await freshBoard();
    await expect(fetchBoard()).rejects.toThrow("board response malformed");
  });
  it("defaults missing credentials/availability to empty arrays", async () => {
    const bare = { ...CAPTAIN, credentials: undefined, availability: undefined };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ profiles: [bare] })));
    const { fetchBoard } = await freshBoard();
    const [p] = await fetchBoard();
    expect(p.credentials).toEqual([]);
    expect(p.availability).toEqual([]);
  });
});

describe("getBoard", () => {
  it("concurrent callers share one fetch; later calls hit the cache", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ profiles: [CAPTAIN] }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshBoard();
    const [a, b] = await Promise.all([mod.getBoard(), mod.getBoard()]);
    expect(a).toBe(b);
    await mod.getBoard();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("a failed fetch does not wedge retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(jsonResponse({ profiles: [CAPTAIN] }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshBoard();
    await expect(mod.getBoard()).rejects.toThrow();
    expect((await mod.getBoard())[0].id).toBe("c");
  });
});
