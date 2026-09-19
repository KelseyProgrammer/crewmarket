import { beforeEach, describe, expect, it, vi } from "vitest";

/* DELETE /api/credentials/[id] — uploader-bound removal (V-2). Denials are
   404, never 403: existence stays hidden. Today crew can remove any own-upload
   including verified ones — policy decision pending with the client
   (docs/CLIENT-DECISIONS-2026-09-16.md); behavior changes land in the shared
   service, not here. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { findUnique: vi.fn(), delete: vi.fn() } },
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: vi.fn(),
  presignedGet: vi.fn(),
  deleteObject: seams.deleteObject,
}));

import { DELETE } from "./route";

const OWN_DOC = { id: "d1", profileId: "p1", uploadedByUserId: "u1", s3Key: "credentials/p1/d1.pdf" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test/api/credentials/d1", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("DELETE /api/credentials/[id]", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await DELETE(req(), params("d1"))).status).toBe(401);
  });

  it("404 for a doc uploaded by a previous claimant — S3 untouched (V-2)", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, uploadedByUserId: "prev" });
    expect((await DELETE(req(), params("d1"))).status).toBe(404);
    expect(seams.deleteObject).not.toHaveBeenCalled();
  });

  it("404 for a doc on a different profile", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, profileId: "other" });
    expect((await DELETE(req(), params("d1"))).status).toBe(404);
  });

  it("deletes own doc: S3 first, then the row", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(OWN_DOC);
    seams.prisma.credentialDoc.delete.mockResolvedValue({});
    const res = await DELETE(req(), params("d1"));
    expect(res.status).toBe(200);
    expect(seams.deleteObject).toHaveBeenCalledWith(OWN_DOC.s3Key);
    expect(seams.prisma.credentialDoc.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });
});
