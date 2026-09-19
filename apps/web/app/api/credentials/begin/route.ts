import { beginUpload, credentialGuard } from "../../../../lib/credential-service";

/* POST /api/credentials/begin — step 1 of the upload protocol for mobile:
   validate, mint docId, presign the PUT (V-2). The response's s3Key/docId are
   an opaque round-trip token for /confirm — same contract the web form uses. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await credentialGuard();
  if ("status" in guard) return Response.json({ error: guard.error }, { status: guard.status });

  let body: { kind?: unknown; contentType?: unknown; sizeBytes?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const r = await beginUpload(guard, {
    kind: String(body.kind ?? ""),
    contentType: String(body.contentType ?? ""),
    sizeBytes: Number(body.sizeBytes),
  });
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  return Response.json(r);
}
