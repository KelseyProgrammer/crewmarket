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

type SelectedCredentialDoc = {
  profileId: string;
  kind: string;
  licenseClass: string | null;
  expiresAt: Date | null;
  verifiedAt: Date | null;
};

/* s3Key deliberately never selected — it must not even reach this layer (V-2) */
const CREDENTIAL_DOC_SELECT = {
  profileId: true,
  kind: true,
  licenseClass: true,
  expiresAt: true,
  verifiedAt: true,
} as const;

export function toPublic(d: SelectedCredentialDoc): PublicCredential {
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
    select: CREDENTIAL_DOC_SELECT,
  });
  return docs.length > 0 ? docs.map(toPublic) : null;
}

/** profileId → credentials, for every claimed profile with ≥1 doc (directory pass). */
export async function credentialOverrideMap(): Promise<Map<string, PublicCredential[]>> {
  const docs = await prisma.credentialDoc.findMany({
    orderBy: { uploadedAt: "desc" },
    select: CREDENTIAL_DOC_SELECT,
  });
  const map = new Map<string, PublicCredential[]>();
  for (const d of docs) {
    const list = map.get(d.profileId) ?? [];
    list.push(toPublic(d));
    map.set(d.profileId, list);
  }
  return map;
}
