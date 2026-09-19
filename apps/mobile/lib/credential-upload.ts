// Pure upload validation + wire types for the credentials screen (no RN
// imports — unit-testable). validateUpload/isValidExpiry mirror
// apps/web/lib/credential-rules.ts and the confirm check EXACTLY (same
// messages) so the client rejects what the server would reject, with the
// same words. The server remains the real gate (V-2).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Null when acceptable; otherwise the server's user-facing error string. */
export function validateUpload(
  contentType: string | undefined,
  sizeBytes: number | undefined,
): string | null {
  if (!contentType || !ALLOWED_TYPES.includes(contentType)) return "Upload a PDF, JPEG, or PNG.";
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "That file looks empty.";
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) return "Files are capped at 10 MB.";
  return null;
}

/** Null when acceptable; otherwise the server's user-facing error string.
 *  Empty/whitespace is fine — the field is optional. Mirrors the confirm
 *  checks in apps/web/lib/credential-service.ts exactly. */
export function validateLicenseClass(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (t.length > 80) return "License class is capped at 80 characters.";
  if (!/^[A-Za-z0-9 ./-]+$/.test(t)) return "License class can use letters, numbers, spaces, . / - only.";
  return null;
}

/** Strict YYYY-MM-DD, real calendar date — mirrors the server's confirm check. */
export function isValidExpiry(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A file chosen from camera/library/files, normalized for the upload flow. */
export type PickedFile = { uri: string; contentType: string; sizeBytes: number };

/** Wire shape of GET /api/credentials rows. */
export type CredentialDocSummary = {
  id: string;
  kind: string;
  licenseClass: string | null;
  expiresAt: string | null; // "YYYY-MM-DD"
  uploadedAt: string; // "YYYY-MM-DD"
  verified: boolean;
};

/** Wire shape of POST /api/credentials/begin. */
export type BeginResponse = { putUrl: string; docId: string; s3Key: string };
