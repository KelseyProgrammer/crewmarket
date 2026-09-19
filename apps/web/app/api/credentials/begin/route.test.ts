import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/credentials/begin — mobile's entry to the presigned upload
   protocol. Same beginUpload the web action wraps; guard failures are 401/403,
   validation failures 400. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  presignedPut: vi.fn(async () => "https://minio.test/put"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: {} }));
vi.mock("../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: seams.presignedPut,
  presignedGet: vi.fn(),
  deleteObject: vi.fn(),
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/credentials/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = { kind: "TWIC", contentType: "application/pdf", sizeBytes: 1234 };

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("POST /api/credentials/begin", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await POST(req(GOOD))).status).toBe(401);
  });

  it("400 on a malformed (non-JSON) body", async () => {
    const res = await POST(
      new Request("http://test/api/credentials/begin", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 with the service's error for a bad kind, before presigning", async () => {
    const res = await POST(req({ ...GOOD, kind: "FAKE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/credential type/);
    expect(seams.presignedPut).not.toHaveBeenCalled();
  });

  it("400 for an oversize file", async () => {
    const res = await POST(req({ ...GOOD, sizeBytes: 11 * 1024 * 1024 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 MB/);
  });

  it("happy path returns putUrl/docId/s3Key bound to the claimed profile", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.putUrl).toBe("https://minio.test/put");
    expect(body.s3Key).toMatch(/^credentials\/p1\//);
    expect(typeof body.docId).toBe("string");
  });
});
