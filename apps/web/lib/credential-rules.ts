/* Pure upload/verification rules — no I/O so they are unit-testable.
   V-2: keys derive from validated content type, never the client filename.
   V-1: admin allowlist is env-driven; empty list admits nobody. */

import { Credential } from "@crewmarket/types";

export const CREDENTIAL_KINDS = Credential.shape.kind.options;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function extensionFor(contentType: string): string | null {
  return EXTENSIONS[contentType] ?? null;
}

/** Null when acceptable; otherwise a user-facing error string. */
export function validateUpload(contentType: string, sizeBytes: number): string | null {
  if (!extensionFor(contentType)) return "Upload a PDF, JPEG, or PNG.";
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "That file looks empty.";
  if (sizeBytes > MAX_UPLOAD_BYTES) return "Files are capped at 10 MB.";
  return null;
}

/** Ids are server-generated (uuid/cuid2); reject anything that could carry path segments (V-2). */
const ID_SHAPE = /^[a-zA-Z0-9-]+$/;

export function s3KeyFor(profileId: string, docId: string, contentType: string): string {
  const ext = extensionFor(contentType);
  if (!ext) throw new Error("s3KeyFor: unsupported content type");
  if (!ID_SHAPE.test(profileId) || !ID_SHAPE.test(docId)) throw new Error("s3KeyFor: invalid id");
  return `credentials/${profileId}/${docId}.${ext}`;
}

export function isAdminEmail(email: string, allowlist: string | undefined): boolean {
  if (!email || !allowlist) return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return false;
  return allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(trimmed);
}
