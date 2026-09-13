import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec §7 guard matrix (2026-09-04 credential spec): these tests pin the
   actions' guard behavior with the four seams mocked — prisma, session/claim,
   storage, next. The pure helpers (credential-rules) run for real. A failing
   test here is a real guard gap, never a test to loosen. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: {
    credentialDoc: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
  headObject: vi.fn(),
  presignedPut: vi.fn(async () => "https://minio.test/put"),
  presignedGet: vi.fn(async () => "https://minio.test/get"),
  deleteObject: vi.fn(async () => undefined),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../lib/credential-storage", () => ({
  headObject: seams.headObject,
  presignedPut: seams.presignedPut,
  presignedGet: seams.presignedGet,
  deleteObject: seams.deleteObject,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import {
  beginCredentialUpload,
  confirmCredentialUpload,
  deleteCredentialDoc,
  viewOwnCredentialDoc,
} from "./credential-actions";

const CREW = { id: "u1", accountType: "CREW", email: "crew@example.test" };
const BOAT = { id: "u2", accountType: "BOAT", email: "boat@example.test" };
const DOC_ID = "doc123";
const GOOD_KEY = `credentials/p1/${DOC_ID}.pdf`;
const GOOD_HEAD = { contentType: "application/pdf", sizeBytes: 1234 };

function signedInCrewWithClaim() {
  seams.sessionUser.mockResolvedValue(CREW);
  seams.claimedProfileId.mockResolvedValue("p1");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("beginCredentialUpload", () => {
  const INPUT = { kind: "TWIC", contentType: "application/pdf", sizeBytes: 1234 };

  it("redirects to sign-in without a session", async () => {
    seams.sessionUser.mockResolvedValue(null);
    await expect(beginCredentialUpload(INPUT)).rejects.toThrow("REDIRECT:/sign-in?from=/account");
  });

  it("rejects BOAT accounts", async () => {
    seams.sessionUser.mockResolvedValue(BOAT);
    expect(await beginCredentialUpload(INPUT)).toEqual({
      error: "Only crew accounts upload credentials.",
    });
  });

  it("rejects a crew session without a claimed profile", async () => {
    seams.sessionUser.mockResolvedValue(CREW);
    seams.claimedProfileId.mockResolvedValue(null);
    const r = await beginCredentialUpload(INPUT);
    expect("error" in r && r.error).toMatch(/isn't linked/);
  });

  it("rejects a kind outside the allowlist", async () => {
    signedInCrewWithClaim();
    const r = await beginCredentialUpload({ ...INPUT, kind: "FAKE_KIND" });
    expect("error" in r && r.error).toMatch(/credential type/);
  });

  it("rejects invalid uploads before presigning", async () => {
    signedInCrewWithClaim();
    const r = await beginCredentialUpload({ ...INPUT, contentType: "image/gif" });
    expect("error" in r).toBe(true);
    expect(seams.presignedPut).not.toHaveBeenCalled();
  });

  it("happy path returns a put URL bound to the claimed profile", async () => {
    signedInCrewWithClaim();
    const r = await beginCredentialUpload(INPUT);
    if ("error" in r) throw new Error(r.error);
    expect(r.putUrl).toBe("https://minio.test/put");
    expect(r.s3Key).toMatch(/^credentials\/p1\//);
  });
});

describe("confirmCredentialUpload", () => {
  const INPUT = { docId: DOC_ID, s3Key: GOOD_KEY, kind: "TWIC" };

  it("rejects a foreign s3Key prefix without spending a HeadObject", async () => {
    signedInCrewWithClaim();
    const r = await confirmCredentialUpload({ ...INPUT, s3Key: "credentials/OTHER/x.pdf" });
    expect(r.error).toMatch(/doesn't belong/);
    expect(seams.headObject).not.toHaveBeenCalled();
  });

  it("rejects a tampered id↔key pairing", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue(GOOD_HEAD);
    const r = await confirmCredentialUpload({ ...INPUT, docId: "differentid" });
    expect(r.error).toMatch(/doesn't match/);
    expect(seams.prisma.credentialDoc.create).not.toHaveBeenCalled();
  });

  it("errors when the object never landed", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue(null);
    const r = await confirmCredentialUpload(INPUT);
    expect(r.error).toMatch(/didn't complete/);
  });

  it("deletes a rejected object instead of keeping it", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue({ contentType: "image/gif", sizeBytes: 10 });
    const r = await confirmCredentialUpload(INPUT);
    expect(r.error).toBeTruthy();
    expect(seams.deleteObject).toHaveBeenCalledWith(GOOD_KEY);
    expect(seams.prisma.credentialDoc.create).not.toHaveBeenCalled();
  });

  it("happy path creates the row and NEVER writes verifiedAt (V-1)", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue(GOOD_HEAD);
    seams.prisma.credentialDoc.create.mockResolvedValue({});
    const r = await confirmCredentialUpload(INPUT);
    expect(r).toEqual({});
    expect(seams.prisma.credentialDoc.create).toHaveBeenCalledTimes(1);
    const data = seams.prisma.credentialDoc.create.mock.calls[0]![0].data;
    expect(data.profileId).toBe("p1");
    expect(Object.keys(data)).not.toContain("verifiedAt");
    expect(Object.keys(data)).not.toContain("verifiedByEmail");
  });
});

describe("deleteCredentialDoc / viewOwnCredentialDoc — uploader-bound (V-2)", () => {
  function form(docId: string) {
    const f = new FormData();
    f.set("docId", docId);
    return f;
  }
  const OWN_DOC = { id: DOC_ID, profileId: "p1", uploadedByUserId: "u1", s3Key: GOOD_KEY };

  it("denies a doc on the right profile uploaded by a previous claimant", async () => {
    signedInCrewWithClaim();
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({
      ...OWN_DOC,
      uploadedByUserId: "previous-user",
    });
    await expect(deleteCredentialDoc(form(DOC_ID))).rejects.toThrow(
      "REDIRECT:/account?cred=denied",
    );
    expect(seams.deleteObject).not.toHaveBeenCalled();
    await expect(viewOwnCredentialDoc(form(DOC_ID))).rejects.toThrow(
      "REDIRECT:/account?cred=denied",
    );
    expect(seams.presignedGet).not.toHaveBeenCalled();
  });

  it("denies a doc on a different profile", async () => {
    signedInCrewWithClaim();
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, profileId: "other" });
    await expect(deleteCredentialDoc(form(DOC_ID))).rejects.toThrow(
      "REDIRECT:/account?cred=denied",
    );
    expect(seams.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes own doc: S3 first, then the row", async () => {
    signedInCrewWithClaim();
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(OWN_DOC);
    seams.prisma.credentialDoc.delete.mockResolvedValue({});
    await deleteCredentialDoc(form(DOC_ID));
    expect(seams.deleteObject).toHaveBeenCalledWith(GOOD_KEY);
    expect(seams.prisma.credentialDoc.delete).toHaveBeenCalledWith({ where: { id: DOC_ID } });
  });
});
