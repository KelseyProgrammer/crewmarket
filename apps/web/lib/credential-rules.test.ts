import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_KINDS,
  MAX_UPLOAD_BYTES,
  extensionFor,
  isAdminEmail,
  s3KeyFor,
  validateUpload,
} from "./credential-rules";

describe("validateUpload", () => {
  it("accepts pdf/jpeg/png within the size cap", () => {
    expect(validateUpload("application/pdf", 1024)).toBeNull();
    expect(validateUpload("image/jpeg", 1024)).toBeNull();
    expect(validateUpload("image/png", MAX_UPLOAD_BYTES)).toBeNull();
  });
  it("rejects other content types", () => {
    expect(validateUpload("image/gif", 10)).toMatch(/PDF, JPEG, or PNG/);
    expect(validateUpload("application/pdf; charset=x", 10)).toMatch(/PDF, JPEG, or PNG/);
  });
  it("rejects oversize and empty files", () => {
    expect(validateUpload("application/pdf", MAX_UPLOAD_BYTES + 1)).toMatch(/10 MB/);
    expect(validateUpload("application/pdf", 0)).toMatch(/empty/i);
  });
});

describe("s3KeyFor", () => {
  it("builds credentials/{profileId}/{docId}.{ext} — extension from content type, never the filename", () => {
    expect(s3KeyFor("p-1", "abc", "application/pdf")).toBe("credentials/p-1/abc.pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
  });
});

describe("isAdminEmail", () => {
  it("matches against the comma-separated allowlist, case-insensitive, trimmed", () => {
    const list = "ops@crewmarket.test, Admin@Example.com";
    expect(isAdminEmail("admin@example.com", list)).toBe(true);
    expect(isAdminEmail("ops@crewmarket.test", list)).toBe(true);
    expect(isAdminEmail("mate@example.com", list)).toBe(false);
  });
  it("empty or missing allowlist admits nobody", () => {
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false);
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
    expect(isAdminEmail("", "a@b.c")).toBe(false);
  });
});

describe("CREDENTIAL_KINDS", () => {
  it("is exactly the packages/types Credential kinds — no medical kinds ever (D-1)", () => {
    expect(CREDENTIAL_KINDS).toEqual([
      "USCG_OUPV", "USCG_MASTER_25_50_100", "STCW_BASIC",
      "CPR_FIRST_AID", "TWIC", "STATE_CHARTER_LICENSE", "OTHER",
    ]);
  });
});
