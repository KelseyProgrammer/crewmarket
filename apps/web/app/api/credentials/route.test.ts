import { beforeEach, describe, expect, it, vi } from "vitest";

/* GET /api/credentials — the caller's own doc list (V-2: no s3Key in the
   payload, ever). Guard: 401 signed out, 403 non-crew/unclaimed — same
   credentialGuard the web actions use. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { findMany: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: vi.fn(),
  presignedGet: vi.fn(),
  deleteObject: vi.fn(),
}));

import { GET } from "./route";

const CREW = { id: "u1", accountType: "CREW" };

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue(CREW);
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("GET /api/credentials", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 for BOAT accounts", async () => {
    seams.sessionUser.mockResolvedValue({ id: "u2", accountType: "BOAT" });
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/crew accounts/);
  });

  it("403 for crew without a claimed profile", async () => {
    seams.claimedProfileId.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
  });

  it("maps docs to the wire shape — dates as YYYY-MM-DD, verified boolean, never s3Key", async () => {
    seams.prisma.credentialDoc.findMany.mockResolvedValue([
      {
        id: "d1",
        kind: "TWIC",
        licenseClass: null,
        expiresAt: new Date("2027-01-15T00:00:00Z"),
        uploadedAt: new Date("2026-09-19T12:00:00Z"),
        verifiedAt: new Date("2026-09-20T12:00:00Z"),
      },
      {
        id: "d2",
        kind: "OTHER",
        licenseClass: "Master 100T",
        expiresAt: null,
        uploadedAt: new Date("2026-09-18T12:00:00Z"),
        verifiedAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const { docs } = await res.json();
    expect(docs).toEqual([
      { id: "d1", kind: "TWIC", licenseClass: null, expiresAt: "2027-01-15", uploadedAt: "2026-09-19", verified: true },
      { id: "d2", kind: "OTHER", licenseClass: "Master 100T", expiresAt: null, uploadedAt: "2026-09-18", verified: false },
    ]);
    expect(JSON.stringify(docs)).not.toContain("s3Key");
    // the select itself must exclude s3Key (V-2)
    const select = seams.prisma.credentialDoc.findMany.mock.calls[0]![0].select;
    expect(Object.keys(select)).not.toContain("s3Key");
  });
});
