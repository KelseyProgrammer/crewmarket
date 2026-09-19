import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@crewmarket/db";
import { claimedProfileId, sessionUser } from "./bookings";
import { CREDENTIAL_KINDS, s3KeyFor, validateUpload } from "./credential-rules";
import { deleteObject, headObject, presignedGet, presignedPut } from "./credential-storage";

/* Shared credential service — the ONE home for the V-1/V-2 upload/delete/view
   guards. apps/web/app/account/credential-actions.ts (web forms) and the
   /api/credentials/* routes (mobile) are both thin wrappers around these
   functions; never re-implement a guard in a wrapper. No redirect/revalidate
   here — callers translate errors to their surface. Never log keys or URLs. */

export type CredentialCtx = { user: { id: string }; profileId: string };
export type GuardFailure = { error: string; status: 401 | 403 };

export async function credentialGuard(): Promise<CredentialCtx | GuardFailure> {
  const user = await sessionUser();
  if (!user) return { error: "sign in required", status: 401 };
  const u = user as { id: string; accountType?: string };
  if (u.accountType !== "CREW") return { error: "Only crew accounts upload credentials.", status: 403 };
  const profileId = await claimedProfileId(u.id);
  if (!profileId) return { error: "Your account isn't linked to a board profile yet.", status: 403 };
  return { user: { id: u.id }, profileId };
}

/** Owner-facing list projection — s3Key deliberately not selected (V-2). */
export async function listDocs(profileId: string) {
  return prisma.credentialDoc.findMany({
    where: { profileId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      kind: true,
      licenseClass: true,
      expiresAt: true,
      uploadedAt: true,
      verifiedAt: true,
    },
  });
}

export type BeginUploadResult =
  | { error: string }
  | { putUrl: string; docId: string; s3Key: string };

export async function beginUpload(
  ctx: CredentialCtx,
  input: { kind: string; contentType: string; sizeBytes: number },
): Promise<BeginUploadResult> {
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose a credential type from the list." };
  }
  const invalid = validateUpload(input.contentType, input.sizeBytes);
  if (invalid) return { error: invalid };

  const docId = createId();
  const s3Key = s3KeyFor(ctx.profileId, docId, input.contentType);
  const putUrl = await presignedPut(s3Key, input.contentType, input.sizeBytes);
  return { putUrl, docId, s3Key };
}

export type ConfirmUploadResult = { error?: string; code?: "duplicate" };

export async function confirmUpload(
  ctx: CredentialCtx,
  input: {
    docId: string;
    s3Key: string;
    kind: string;
    licenseClass?: string;
    expiresAt?: string; // "YYYY-MM-DD"
  },
): Promise<ConfirmUploadResult> {
  // Cheap pre-HeadObject guard — the key encodes the profile, so this rejects
  // foreign keys before we spend a HeadObject call on them.
  if (!input.s3Key.startsWith(`credentials/${ctx.profileId}/`)) {
    return { error: "That upload doesn't belong to your profile." };
  }
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose a credential type from the list." };
  }

  const licenseClass = input.licenseClass?.trim() || null;
  if (licenseClass && licenseClass.length > 80) {
    return { error: "License class is capped at 80 characters." };
  }
  if (licenseClass && !/^[A-Za-z0-9 ./-]+$/.test(licenseClass)) {
    return { error: "License class can use letters, numbers, spaces, . / - only." };
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) return { error: "Enter a valid expiry date." };
    const d = new Date(input.expiresAt + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.expiresAt) {
      return { error: "Enter a valid expiry date." };
    }
    expiresAt = d;
  }

  const head = await headObject(input.s3Key);
  if (!head) return { error: "Upload didn't complete — try again." };
  const invalid = validateUpload(head.contentType, head.sizeBytes);
  if (invalid) {
    await deleteObject(input.s3Key).catch(() => undefined); // don't leave a rejected upload in the bucket
    return { error: invalid };
  }

  // Bind id ↔ key ↔ stored content type: recomputing the key validates docId shape
  // (s3KeyFor throws on malformed ids) and rejects any client-tampered pairing.
  let expectedKey: string;
  try {
    expectedKey = s3KeyFor(ctx.profileId, input.docId, head.contentType);
  } catch {
    return { error: "That upload doesn't match your profile." };
  }
  if (expectedKey !== input.s3Key) return { error: "That upload doesn't match your profile." };

  try {
    await prisma.credentialDoc.create({
      data: {
        id: input.docId,
        profileId: ctx.profileId,
        uploadedByUserId: ctx.user.id,
        kind: input.kind,
        licenseClass,
        expiresAt,
        s3Key: input.s3Key,
        contentType: head.contentType,
        sizeBytes: head.sizeBytes,
        // verifiedAt deliberately absent: every new upload is self-reported (V-1)
      },
    });
  } catch (err) {
    // duplicate = an identical confirm already landed; callers may treat as already-done
    if ((err as { code?: string }).code === "P2002") return { error: "That document was already saved.", code: "duplicate" };
    throw err;
  }
  return {};
}

/** Uploader-bound removal (V-2). Denial reads as "not found" — existence stays hidden. */
export async function deleteDoc(
  ctx: CredentialCtx,
  docId: string,
): Promise<{ error?: string; status?: number }> {
  const doc = await prisma.credentialDoc.findUnique({ where: { id: docId } });
  // uploader-bound, not just claim-bound: a re-assigned claim must never expose the previous person's documents (V-2)
  if (!doc || doc.profileId !== ctx.profileId || doc.uploadedByUserId !== ctx.user.id) {
    return { error: "not found", status: 404 };
  }
  await deleteObject(doc.s3Key); // S3 first — if this throws, the row survives and Remove can be retried (V-2)
  await prisma.credentialDoc.delete({ where: { id: doc.id } });
  return {};
}

/** Owner-only short-lived view URL for their own document (V-2). */
export async function viewDocUrl(
  ctx: CredentialCtx,
  docId: string,
): Promise<{ url: string } | { error: string; status: number }> {
  const doc = await prisma.credentialDoc.findUnique({ where: { id: docId } });
  // uploader-bound, not just claim-bound: a re-assigned claim must never expose the previous person's documents (V-2)
  if (!doc || doc.profileId !== ctx.profileId || doc.uploadedByUserId !== ctx.user.id) {
    return { error: "not found", status: 404 };
  }
  return { url: await presignedGet(doc.s3Key) };
}
