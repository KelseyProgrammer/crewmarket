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
  // The key encodes the profile — reject confirms for keys this claim doesn't own.
  if (!input.s3Key.startsWith(`credentials/${ctx.profileId}/`)) {
    return { error: "That upload doesn't belong to your profile." };
  }
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose a credential type from the list." };
  }
  const head = await headObject(input.s3Key);
  if (!head) return { error: "Upload didn't complete — try again." };
  const invalid = validateUpload(head.contentType, head.sizeBytes);
  if (invalid) {
    await deleteObject(input.s3Key).catch(() => undefined); // don't leave a rejected upload in the bucket
    return { error: invalid };
  }

  const expiresAt =
    input.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)
      ? new Date(input.expiresAt + "T00:00:00Z")
      : null;

  await prisma.credentialDoc.create({
    data: {
      id: input.docId,
      profileId: ctx.profileId,
      uploadedByUserId: ctx.user.id,
      kind: input.kind,
      licenseClass: input.licenseClass?.trim() || null,
      expiresAt,
      s3Key: input.s3Key,
      contentType: head.contentType,
      sizeBytes: head.sizeBytes,
      // verifiedAt deliberately absent: every new upload is self-reported (V-1)
    },
  });
  revalidatePath("/account");
  return {};
}

export async function deleteCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return;
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  if (!doc || doc.profileId !== ctx.profileId) return;
  await deleteObject(doc.s3Key); // S3 first — if this throws, the row survives and Remove can be retried (V-2)
  await prisma.credentialDoc.delete({ where: { id: doc.id } });
  revalidatePath("/account");
}

/** Owner-only short-lived view of their own document (V-2). */
export async function viewOwnCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return;
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  if (!doc || doc.profileId !== ctx.profileId) return;
  redirect(await presignedGet(doc.s3Key));
}
