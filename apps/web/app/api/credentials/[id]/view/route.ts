import { credentialGuard, viewDocUrl } from "../../../../../lib/credential-service";

/* POST /api/credentials/[id]/view — owner-only short-lived presigned GET
   (V-2). POST, not GET, so nothing caches/prefetches a URL-minting endpoint.
   The URL expires in 60s — the client must open it immediately. */

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await credentialGuard();
  if ("status" in guard) return Response.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const r = await viewDocUrl(guard, id);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  // no-store is belt-and-braces on top of POST + force-dynamic: the body carries a signed URL
  return Response.json({ url: r.url }, { headers: { "Cache-Control": "no-store" } });
}
