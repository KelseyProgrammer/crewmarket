import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Spec §7: "verify rejected for non-allowlisted email" — V-1's admin gate.
   isAdminEmail runs for real against a stubbed ADMIN_EMAILS env. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  prisma: { credentialDoc: { findUnique: vi.fn(), update: vi.fn() } },
  presignedGet: vi.fn(async () => "https://minio.test/get"),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../lib/bookings", () => ({ sessionUser: seams.sessionUser }));
vi.mock("../../../lib/credential-storage", () => ({ presignedGet: seams.presignedGet }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import { setCredentialVerified, viewCredentialDocAsAdmin } from "./actions";

const ADMIN = { id: "a1", email: "admin@crewmarket.test", accountType: "BOAT" };
const CREW = { id: "u1", email: "crew@example.test", accountType: "CREW" };
const DOC = { id: "doc123", profileId: "p1", s3Key: "credentials/p1/doc123.pdf" };

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_EMAILS", "admin@crewmarket.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("setCredentialVerified (V-1: the only verifiedAt writer)", () => {
  it("does nothing for a signed-in non-admin", async () => {
    seams.sessionUser.mockResolvedValue(CREW);
    await setCredentialVerified(form({ docId: DOC.id, verify: "1" }));
    expect(seams.prisma.credentialDoc.update).not.toHaveBeenCalled();
  });

  it("does nothing without a session", async () => {
    seams.sessionUser.mockResolvedValue(null);
    await setCredentialVerified(form({ docId: DOC.id, verify: "1" }));
    expect(seams.prisma.credentialDoc.update).not.toHaveBeenCalled();
  });

  it("admin verify stamps verifiedAt + verifiedByEmail", async () => {
    seams.sessionUser.mockResolvedValue(ADMIN);
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(DOC);
    seams.prisma.credentialDoc.update.mockResolvedValue({});
    await setCredentialVerified(form({ docId: DOC.id, verify: "1" }));
    const arg = seams.prisma.credentialDoc.update.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: DOC.id });
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
    expect(arg.data.verifiedByEmail).toBe(ADMIN.email);
  });

  it("admin unverify nulls both fields", async () => {
    seams.sessionUser.mockResolvedValue(ADMIN);
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(DOC);
    seams.prisma.credentialDoc.update.mockResolvedValue({});
    await setCredentialVerified(form({ docId: DOC.id }));
    expect(seams.prisma.credentialDoc.update.mock.calls[0]![0].data).toEqual({
      verifiedAt: null,
      verifiedByEmail: null,
    });
  });
});

describe("viewCredentialDocAsAdmin", () => {
  it("never presigns for a non-admin", async () => {
    seams.sessionUser.mockResolvedValue(CREW);
    await viewCredentialDocAsAdmin(form({ docId: DOC.id }));
    expect(seams.presignedGet).not.toHaveBeenCalled();
  });

  it("redirects an admin to a short-lived URL", async () => {
    seams.sessionUser.mockResolvedValue(ADMIN);
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(DOC);
    await expect(viewCredentialDocAsAdmin(form({ docId: DOC.id }))).rejects.toThrow(
      "REDIRECT:https://minio.test/get",
    );
  });
});
