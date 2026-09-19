import { credentialGuard, listDocs } from "../../../lib/credential-service";

/* GET /api/credentials — the caller's own credential docs for the mobile
   account surface. Wire shape carries `verified` as a boolean only; verifiedAt
   stays server-side and admin-set (V-1). s3Key never leaves the server from
   this route (V-2). */

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await credentialGuard();
  if ("status" in guard) return Response.json({ error: guard.error }, { status: guard.status });

  const docs = await listDocs(guard.profileId);
  return Response.json({
    docs: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      licenseClass: d.licenseClass,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : null,
      uploadedAt: d.uploadedAt.toISOString().slice(0, 10),
      verified: Boolean(d.verifiedAt),
    })),
  });
}
