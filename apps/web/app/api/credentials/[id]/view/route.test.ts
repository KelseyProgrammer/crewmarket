import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/credentials/[id]/view — owner-only short-lived presigned GET
   (V-2). POST, not GET: nothing may cache or prefetch a URL-minting endpoint.
   Denials are 404 — existence stays hidden. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { findUnique: vi.fn() } },
  presignedGet: vi.fn(async () => "https://minio.test/get"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: vi.fn(),
  presignedGet: seams.presignedGet,
  deleteObject: vi.fn(),
}));

import { POST } from "./route";

const OWN_DOC = { id: "d1", profileId: "p1", uploadedByUserId: "u1", s3Key: "credentials/p1/d1.pdf" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test/api/credentials/d1/view", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("POST /api/credentials/[id]/view", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await POST(req(), params("d1"))).status).toBe(401);
  });

  it("404 for a previous claimant's doc — no URL minted (V-2)", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, uploadedByUserId: "prev" });
    expect((await POST(req(), params("d1"))).status).toBe(404);
    expect(seams.presignedGet).not.toHaveBeenCalled();
  });

  it("happy path returns the short-lived URL", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(OWN_DOC);
    const res = await POST(req(), params("d1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://minio.test/get" });
  });
});
