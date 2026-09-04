import "server-only";
import { prisma } from "@crewmarket/db";

/* Claimed profiles with uploaded docs render credentials from the DB instead of
   seed data, so the admin's verification is what the public actually sees.
   Only structured fields cross this boundary — never s3Key (V-2/V-3). */

export type PublicCredential = {
  kind: string;
  licenseClass?: string;
  expiresAt?: string;
  verified: boolean;
};

function toPublic(d: {
  kind: string;
  licenseClass: string | null;
  expiresAt: Date | null;
  verifiedAt: Date | null;
}): PublicCredential {
  return {
    kind: d.kind,
    ...(d.licenseClass ? { licenseClass: d.licenseClass } : {}),
    ...(d.expiresAt ? { expiresAt: d.expiresAt.toISOString().slice(0, 10) } : {}),
    verified: d.verifiedAt !== null,
  };
}

export async function credentialsForProfile(profileId: string): Promise<PublicCredential[] | null> {
  const docs = await prisma.credentialDoc.findMany({
    where: { profileId },
    orderBy: { uploadedAt: "desc" },
  });
  return docs.length > 0 ? docs.map(toPublic) : null;
}

/** profileId → credentials, for every claimed profile with ≥1 doc (directory pass). */
export async function credentialOverrideMap(): Promise<Map<string, PublicCredential[]>> {
  const docs = await prisma.credentialDoc.findMany({ orderBy: { uploadedAt: "desc" } });
  const map = new Map<string, PublicCredential[]>();
  for (const d of docs) {
    const list = map.get(d.profileId) ?? [];
    list.push(toPublic(d));
    map.set(d.profileId, list);
  }
  return map;
}
