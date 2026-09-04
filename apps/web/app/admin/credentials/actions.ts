"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import { sessionUser } from "../../../lib/bookings";
import { isAdminEmail } from "../../../lib/credential-rules";
import { presignedGet } from "../../../lib/credential-storage";

/* V-1: the ONLY code path that writes verifiedAt. Allowlist re-checked in every
   action, not just the page. SOW 2.ii: flag + view only, no review tooling. */

async function requireAdmin() {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) return null;
  return user;
}

export async function setCredentialVerified(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const docId = String(formData.get("docId"));
  const verify = formData.get("verify") === "1";
  await prisma.credentialDoc.update({
    where: { id: docId },
    data: verify
      ? { verifiedAt: new Date(), verifiedByEmail: admin.email }
      : { verifiedAt: null, verifiedByEmail: null },
  });
  revalidatePath("/admin/credentials");
}

export async function viewCredentialDocAsAdmin(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  if (!doc) return;
  redirect(await presignedGet(doc.s3Key));
}
