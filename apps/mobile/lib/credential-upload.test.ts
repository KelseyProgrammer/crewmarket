import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  isValidExpiry,
  validateLicenseClass,
  validateUpload,
} from "./credential-upload";

describe("validateUpload (mirrors apps/web/lib/credential-rules.ts exactly)", () => {
  it("accepts pdf/jpeg/png under the cap", () => {
    expect(validateUpload("application/pdf", 1234)).toBeNull();
    expect(validateUpload("image/jpeg", 1234)).toBeNull();
    expect(validateUpload("image/png", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("rejects other types with the server's message", () => {
    expect(validateUpload("image/gif", 1234)).toBe("Upload a PDF, JPEG, or PNG.");
    expect(validateUpload(undefined, 1234)).toBe("Upload a PDF, JPEG, or PNG.");
  });

  it("rejects empty and oversize files with the server's messages", () => {
    expect(validateUpload("application/pdf", 0)).toBe("That file looks empty.");
    expect(validateUpload("application/pdf", undefined)).toBe("That file looks empty.");
    expect(validateUpload("application/pdf", MAX_UPLOAD_BYTES + 1)).toBe("Files are capped at 10 MB.");
  });
});

describe("validateLicenseClass (mirrors the server's confirm checks)", () => {
  it("accepts empty (optional) and normal values", () => {
    expect(validateLicenseClass("")).toBeNull();
    expect(validateLicenseClass("  ")).toBeNull();
    expect(validateLicenseClass("Master 100T")).toBeNull();
    expect(validateLicenseClass("OUPV/6-pack v2.1")).toBeNull();
  });
  it("rejects over-80 and out-of-charset values with the server's messages", () => {
    expect(validateLicenseClass("x".repeat(81))).toBe("License class is capped at 80 characters.");
    expect(validateLicenseClass("Master 100T (Near Coastal)")).toBe(
      "License class can use letters, numbers, spaces, . / - only.",
    );
  });
});

describe("isValidExpiry (mirrors the server's confirm check)", () => {
  it("accepts real YYYY-MM-DD dates", () => {
    expect(isValidExpiry("2027-01-15")).toBe(true);
  });
  it("rejects malformed or impossible dates", () => {
    expect(isValidExpiry("01/15/2027")).toBe(false);
    expect(isValidExpiry("2027-02-30")).toBe(false);
    expect(isValidExpiry("")).toBe(false);
  });
});
