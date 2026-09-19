import { confirmUpload, credentialGuard } from "../../../../lib/credential-service";

/* POST /api/credentials/confirm — step 3 of the upload protocol: HeadObject
   re-validation + id↔key binding happen in the shared service (V-1/V-2). */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await credentialGuard();
  if ("status" in guard) return Response.json({ error: guard.error }, { status: guard.status });

  let body: {
    docId?: unknown;
    s3Key?: unknown;
    kind?: unknown;
    licenseClass?: unknown;
    expiresAt?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const r = await confirmUpload(guard, {
    docId: String(body.docId ?? ""),
    s3Key: String(body.s3Key ?? ""),
    kind: String(body.kind ?? ""),
    licenseClass: typeof body.licenseClass === "string" ? body.licenseClass : undefined,
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : undefined,
  });
  if (r.error) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({});
}
