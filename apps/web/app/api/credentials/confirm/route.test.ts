import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/credentials/confirm — the HeadObject-verified finish of the upload
   protocol. The real service guards run here (foreign-key prefix, id↔key
   binding, V-1 no-verifiedAt) with only the seams mocked. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { create: vi.fn() } },
  headObject: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../lib/credential-storage", () => ({
  headObject: seams.headObject,
  presignedPut: vi.fn(),
  presignedGet: vi.fn(),
  deleteObject: seams.deleteObject,
}));

import { POST } from "./route";

const DOC_ID = "doc123";
const GOOD_KEY = `credentials/p1/${DOC_ID}.pdf`;
const GOOD = { docId: DOC_ID, s3Key: GOOD_KEY, kind: "TWIC" };

function req(body: unknown) {
  return new Request("http://test/api/credentials/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
  seams.headObject.mockResolvedValue({ contentType: "application/pdf", sizeBytes: 1234 });
});

describe("POST /api/credentials/confirm", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await POST(req(GOOD))).status).toBe(401);
  });

  it("400 rejects a foreign s3Key prefix without spending a HeadObject", async () => {
    const res = await POST(req({ ...GOOD, s3Key: "credentials/OTHER/x.pdf" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/doesn't belong/);
    expect(seams.headObject).not.toHaveBeenCalled();
  });

  it("400 when the object never landed", async () => {
    seams.headObject.mockResolvedValue(null);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/didn't complete/);
  });

  it("happy path creates the row, passes optional fields, and NEVER writes verifiedAt (V-1)", async () => {
    seams.prisma.credentialDoc.create.mockResolvedValue({});
    const res = await POST(req({ ...GOOD, licenseClass: "Master 100T", expiresAt: "2027-01-15" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const data = seams.prisma.credentialDoc.create.mock.calls[0]![0].data;
    expect(data.profileId).toBe("p1");
    expect(data.licenseClass).toBe("Master 100T");
    expect(Object.keys(data)).not.toContain("verifiedAt");
  });

  it("409 (not 400) when the same confirm already landed — retry-safe for mobile", async () => {
    seams.prisma.credentialDoc.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already saved/);
  });

  it("400 on a malformed (non-JSON) body", async () => {
    const res = await POST(
      new Request("http://test/api/credentials/confirm", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });
});
