"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@crewmarket/db";
import { claimedProfileId, sessionUser } from "../../lib/bookings";
import { CREDENTIAL_KINDS, s3KeyFor, validateUpload } from "../../lib/credential-rules";
import { deleteObject, headObject, presignedGet, presignedPut } from "../../lib/credential-storage";

/* Upload protocol: begin → client PUTs to the presigned URL → confirm.
   The DB row is created at confirm, after HeadObject proves the object exists
   and matches what was authorized — no orphan rows, no trusting client metadata.
   Every action re-checks session + claim (V-1). Nothing here logs keys (V-2). */

async function requireClaimedProfile() {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/account");
  if (user.accountType !== "CREW") return { error: "Only crew accounts upload credentials." } as const;
  const profileId = await claimedProfileId(user.id);
  if (!profileId) return { error: "Your account isn't linked to a board profile yet." } as const;
  return { user, profileId } as const;
}

export type BeginUploadResult =
  | { error: string }
  | { putUrl: string; docId: string; s3Key: string };

export async function beginCredentialUpload(input: {
  kind: string;
  contentType: string;
  sizeBytes: number;
}): Promise<BeginUploadResult> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return { error: ctx.error };
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

export type ConfirmUploadResult = { error?: string };

export async function confirmCredentialUpload(input: {
  docId: string;
  s3Key: string;
  kind: string;
  licenseClass?: string;
  expiresAt?: string; // "YYYY-MM-DD"
}): Promise<ConfirmUploadResult> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return { error: ctx.error };
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
    if ((err as { code?: string }).code === "P2002") return { error: "That document was already saved." };
    throw err;
  }
  revalidatePath("/account");
  revalidatePath(`/crew/${ctx.profileId}`);
  revalidatePath("/directory");
  return {};
}

export async function deleteCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) redirect("/account?cred=denied");
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  // uploader-bound, not just claim-bound: a re-assigned claim must never expose the previous person's documents (V-2)
  if (!doc || doc.profileId !== ctx.profileId || doc.uploadedByUserId !== ctx.user.id) {
    redirect("/account?cred=denied");
  }
  await deleteObject(doc.s3Key); // S3 first — if this throws, the row survives and Remove can be retried (V-2)
  await prisma.credentialDoc.delete({ where: { id: doc.id } });
  revalidatePath("/account");
  revalidatePath(`/crew/${ctx.profileId}`);
  revalidatePath("/directory");
}

/** Owner-only short-lived view of their own document (V-2). */
export async function viewOwnCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) redirect("/account?cred=denied");
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  // uploader-bound, not just claim-bound: a re-assigned claim must never expose the previous person's documents (V-2)
  if (!doc || doc.profileId !== ctx.profileId || doc.uploadedByUserId !== ctx.user.id) {
    redirect("/account?cred=denied");
  }
  redirect(await presignedGet(doc.s3Key));
}
