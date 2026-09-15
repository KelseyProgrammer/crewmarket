import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  claimedProfileId: vi.fn(),
}));
vi.mock("../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("../../../lib/bookings", () => ({ claimedProfileId: seams.claimedProfileId }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: { id: "u1", accountType: "CREW" } });
  seams.claimedProfileId.mockResolvedValue(null);
});

describe("GET /api/me", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("returns id, accountType, claimedProfileId (null)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "u1", accountType: "CREW", claimedProfileId: null });
  });
  it("includes the claimed profile id when present", async () => {
    seams.claimedProfileId.mockResolvedValue("p-known");
    expect((await (await GET()).json()).claimedProfileId).toBe("p-known");
  });
});
