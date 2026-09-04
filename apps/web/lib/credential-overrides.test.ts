import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: {} }));

const { toPublic } = await import("./credential-overrides");

describe("toPublic — the V-2 public boundary", () => {
  it("emits exactly kind/licenseClass/expiresAt/verified — never storage or reviewer fields", () => {
    const pub = toPublic({
      kind: "STCW_BASIC",
      licenseClass: "Master 100T",
      expiresAt: new Date("2028-06-15T00:00:00Z"),
      verifiedAt: new Date("2026-09-04T12:00:00Z"),
      // fields that must never leak, even if present on the row object:
      ...({ s3Key: "credentials/p/x.pdf", verifiedByEmail: "a@b.c", uploadedByUserId: "u1" } as object),
    } as never);
    expect(Object.keys(pub).sort()).toEqual(["expiresAt", "kind", "licenseClass", "verified"]);
    expect(pub).toEqual({ kind: "STCW_BASIC", licenseClass: "Master 100T", expiresAt: "2028-06-15", verified: true });
  });
  it("null fields are omitted and verified is false when verifiedAt is null", () => {
    const pub = toPublic({ kind: "TWIC", licenseClass: null, expiresAt: null, verifiedAt: null } as never);
    expect(pub).toEqual({ kind: "TWIC", verified: false });
    expect("licenseClass" in pub).toBe(false);
    expect("expiresAt" in pub).toBe(false);
  });
});
