import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  prisma: {
    crewProfileClaim: { findUnique: vi.fn(), create: vi.fn() },
    credentialDoc: { count: vi.fn() },
  },
}));

vi.mock("../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
// A real seed profile id exists; use one from the JSON. Mock the seed import to a known set.
vi.mock("../../../data/seed-crew.json", () => ({
  default: { profiles: [{ id: "p-known", displayName: "Test Crew", roles: ["MATE"] }] },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { POST } from "./route";

const CREW = { id: "u1", email: "c@x.test", accountType: "CREW" };

function post(body: unknown) {
  return POST(new Request("http://localhost/api/claim", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: CREW });
  seams.prisma.crewProfileClaim.findUnique.mockResolvedValue(null); // no existing claim (either key)
  seams.prisma.credentialDoc.count.mockResolvedValue(0);
  seams.prisma.crewProfileClaim.create.mockResolvedValue({ userId: "u1", profileId: "p-known" });
});

describe("POST /api/claim", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await post({ profileId: "p-known" })).status).toBe(401);
  });
  it("403 for non-crew", async () => {
    seams.getSession.mockResolvedValue({ user: { ...CREW, accountType: "BOAT" } });
    expect((await post({ profileId: "p-known" })).status).toBe(403);
  });
  it("404 for unknown profile", async () => {
    expect((await post({ profileId: "nope" })).status).toBe(404);
  });
  it("409 when the user already has a claim", async () => {
    seams.prisma.crewProfileClaim.findUnique.mockImplementation(({ where }: any) =>
      where.userId ? { userId: "u1", profileId: "other" } : null);
    expect((await post({ profileId: "p-known" })).status).toBe(409);
    expect(seams.prisma.crewProfileClaim.create).not.toHaveBeenCalled();
  });
  it("409 when the profile is already claimed", async () => {
    seams.prisma.crewProfileClaim.findUnique.mockImplementation(({ where }: any) =>
      where.profileId ? { userId: "someoneelse", profileId: "p-known" } : null);
    expect((await post({ profileId: "p-known" })).status).toBe(409);
    expect(seams.prisma.crewProfileClaim.create).not.toHaveBeenCalled();
  });
  it("409 (V-2) when the profile has credential docs", async () => {
    seams.prisma.credentialDoc.count.mockResolvedValue(2);
    expect((await post({ profileId: "p-known" })).status).toBe(409);
    expect(seams.prisma.crewProfileClaim.create).not.toHaveBeenCalled();
  });
  it("200 and creates the claim on the happy path", async () => {
    const res = await post({ profileId: "p-known" });
    expect(res.status).toBe(200);
    expect(seams.prisma.crewProfileClaim.create).toHaveBeenCalledWith({
      data: { userId: "u1", profileId: "p-known" },
    });
  });
  it("maps a P2002 unique-collision to 409", async () => {
    seams.prisma.crewProfileClaim.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await post({ profileId: "p-known" })).status).toBe(409);
  });
});
