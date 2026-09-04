#!/usr/bin/env node
/**
 * demo-claim.mjs — link a CREW account to a registry profile (docs/BOOKING_BRIEF.md:
 * documented demo bridge for the crew-identity gap; replaced by real crew onboarding
 * in a later phase). Synthetic/demo use only.
 *
 *   node --env-file=.env.local scripts/demo-claim.mjs <userEmail> [profileId] [--force-docs]
 *
 * Without profileId, claims the first MATE profile in the seed.
 *
 * Reassigning a profile's claim away from its current owner must never leave the
 * previous person's credential documents reachable by the new claimant (V-2) — so
 * a target profile with existing credentialDoc rows blocks the reclaim unless
 * --force-docs is passed, in which case those rows AND their S3 objects are
 * deleted first.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Resolve @prisma/client through packages/db (pnpm keeps it out of the root).
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");

// Resolve the aws-sdk packages through apps/web (pnpm keeps them out of the root).
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { S3Client, DeleteObjectCommand } = requireWeb("@aws-sdk/client-s3");

const args = process.argv.slice(2).filter((a) => a !== "--force-docs");
const forceDocs = process.argv.includes("--force-docs");
const [email, profileArg] = args;
if (!email) {
  console.error("usage: node --env-file=.env.local scripts/demo-claim.mjs <userEmail> [profileId] [--force-docs]");
  process.exit(1);
}

const prisma = new PrismaClient();
const seed = JSON.parse(readFileSync(new URL("../apps/web/data/seed-crew.json", import.meta.url)));

const profile = profileArg
  ? seed.profiles.find((p) => p.id === profileArg)
  : seed.profiles.find((p) => p.roles.includes("MATE"));
if (!profile) {
  console.error("no such profile in seed-crew.json");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`no account for ${email} — sign up first`);
  process.exit(1);
}
if (user.accountType !== "CREW") {
  console.error(`${email} is a ${user.accountType} account — only CREW accounts drive profiles`);
  process.exit(1);
}

const existingDocs = await prisma.credentialDoc.findMany({ where: { profileId: profile.id } });
if (existingDocs.length > 0) {
  if (!forceDocs) {
    console.error(
      `"${profile.displayName}" (${profile.id}) has ${existingDocs.length} credential document(s) on file. ` +
        `Reclaiming this profile would hand them to a new account (V-2). ` +
        `Remove the documents first, or pass --force-docs to delete them and proceed.`
    );
    process.exit(1);
  }

  // Same S3 env/client pattern as apps/web/lib/credential-storage.ts — never log keys (V-2).
  const BUCKET = process.env.S3_BUCKET ?? "credential-docs";
  const s3 = new S3Client({
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    ...(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
      ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } }
      : {}),
  });

  for (const doc of existingDocs) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: doc.s3Key }));
  }
  await prisma.credentialDoc.deleteMany({ where: { profileId: profile.id } });
  console.log(`--force-docs: deleted ${existingDocs.length} credential document(s) for ${profile.id}`);
}

await prisma.crewProfileClaim.deleteMany({ where: { OR: [{ userId: user.id }, { profileId: profile.id }] } });
await prisma.crewProfileClaim.create({ data: { userId: user.id, profileId: profile.id } });
console.log(`claimed: ${email} now drives "${profile.displayName}" (${profile.id})`);
await prisma.$disconnect();
