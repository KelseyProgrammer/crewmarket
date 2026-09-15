import { headers } from "next/headers";
import { prisma } from "@crewmarket/db";
import { auth } from "../../../lib/auth";
import seed from "../../../data/seed-crew.json";

export const dynamic = "force-dynamic";

const PROFILE_IDS = new Set((seed as { profiles: { id: string }[] }).profiles.map((p) => p.id));

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string; accountType?: string };
  if (user.accountType !== "CREW") {
    return Response.json({ error: "Only crew accounts can claim a profile." }, { status: 403 });
  }

  const { profileId } = (await req.json().catch(() => ({}))) as { profileId?: string };
  if (!profileId || !PROFILE_IDS.has(profileId)) {
    return Response.json({ error: "Unknown profile." }, { status: 404 });
  }

  const [mine, taken, docCount] = await Promise.all([
    prisma.crewProfileClaim.findUnique({ where: { userId: user.id } }),
    prisma.crewProfileClaim.findUnique({ where: { profileId } }),
    prisma.credentialDoc.count({ where: { profileId } }),
  ]);
  if (mine) return Response.json({ error: "You already drive a profile." }, { status: 409 });
  if (taken) return Response.json({ error: "This profile is already claimed." }, { status: 409 });
  if (docCount > 0) {
    // V-2: never hand a stranger's uploaded documents to a new owner via self-claim.
    return Response.json(
      { error: "This profile has documents on file and can't be claimed here." },
      { status: 409 }
    );
  }

  try {
    await prisma.crewProfileClaim.create({ data: { userId: user.id, profileId } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return Response.json({ error: "This profile is already claimed." }, { status: 409 });
    }
    throw err;
  }
  return Response.json({ ok: true, profileId });
}
