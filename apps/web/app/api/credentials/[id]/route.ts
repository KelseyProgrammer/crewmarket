import { credentialGuard, deleteDoc } from "../../../../lib/credential-service";

/* DELETE /api/credentials/[id] — uploader-bound removal via the shared service
   (V-2). Denials are 404, never 403 — existence stays hidden. Verified-doc
   deletion policy is a pending client decision; any change lands in the
   service, not here. */

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await credentialGuard();
  if ("status" in guard) return Response.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const r = await deleteDoc(guard, id);
  if (r.error) return Response.json({ error: r.error }, { status: r.status ?? 400 });
  return Response.json({});
}
