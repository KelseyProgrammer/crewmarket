"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  beginUpload,
  confirmUpload,
  credentialGuard,
  deleteDoc,
  viewDocUrl,
  type CredentialCtx,
} from "../../lib/credential-service";

/* Thin web-form wrappers around lib/credential-service — the ONE home for the
   V-1/V-2 guards. This file adds only web concerns: redirects and cache
   revalidation. Never add a guard here; add it to the service. */

async function requireClaimedProfile(): Promise<CredentialCtx | { error: string }> {
  const guard = await credentialGuard();
  if ("status" in guard && guard.status === 401) redirect("/sign-in?from=/account");
  if ("status" in guard) return { error: guard.error };
  return guard;
}

function revalidateCredentialSurfaces(profileId: string) {
  revalidatePath("/account");
  revalidatePath(`/crew/${profileId}`);
  revalidatePath("/directory");
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
  return beginUpload(ctx, input);
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
  const r = await confirmUpload(ctx, input);
  if (r.error) return r;
  revalidateCredentialSurfaces(ctx.profileId);
  return {};
}

export async function deleteCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) redirect("/account?cred=denied");
  const r = await deleteDoc(ctx, String(formData.get("docId")));
  if (r.error) redirect("/account?cred=denied");
  revalidateCredentialSurfaces(ctx.profileId);
}

/** Owner-only short-lived view of their own document (V-2). */
export async function viewOwnCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) redirect("/account?cred=denied");
  const r = await viewDocUrl(ctx, String(formData.get("docId")));
  if ("error" in r) redirect("/account?cred=denied");
  redirect(r.url);
}
