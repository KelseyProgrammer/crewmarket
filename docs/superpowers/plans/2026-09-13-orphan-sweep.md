# S3 Orphan Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `scripts/sweep-orphan-credentials.mjs` (dry-run default, `--delete`, 24h age gate, dangling rows report-only) and verify it with a live MinIO rehearsal.

**Architecture:** One self-contained root ops script in the established `createRequire` pattern; pure classify step inline; verification is a scripted end-to-end rehearsal, not unit tests.

**Tech Stack:** node --env-file, @prisma/client via packages/db, @aws-sdk/client-s3 via apps/web.

**Spec:** `docs/superpowers/specs/2026-09-13-orphan-sweep-design.md`

---

### Task 1: The script

**Files:**
- Create: `scripts/sweep-orphan-credentials.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// sweep-orphan-credentials.mjs — remove credential-bucket objects that were
// PUT via a presigned URL but never confirmed (no credentialDoc row).
// Run (dry-run):  node --env-file=.env.local scripts/sweep-orphan-credentials.mjs
// Delete:         node --env-file=.env.local scripts/sweep-orphan-credentials.mjs --delete
// Flags: --delete (actually remove), --min-age-hours N (default 24; presigned
//        PUTs expire in 300s so nothing in-flight can be 24h old).
// Dangling rows (row exists, object missing) are REPORTED ONLY — whether
// verified docs may ever be deleted is an open client policy question.
// V-2: prints opaque keys to the operator console only; never presigns/logs URLs.
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = requireWeb("@aws-sdk/client-s3");

const DELETE = process.argv.includes("--delete");
const minAgeIdx = process.argv.indexOf("--min-age-hours");
const MIN_AGE_HOURS = minAgeIdx === -1 ? 24 : Number(process.argv[minAgeIdx + 1]);
if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) {
  console.error("--min-age-hours must be a non-negative number");
  process.exit(1);
}

const BUCKET = process.env.S3_BUCKET ?? "credential-docs";
const prisma = new PrismaClient();
const s3 = new S3Client({
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  ...(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } }
    : {}),
});

async function listAllObjects() {
  const objects = [];
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "credentials/", ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      if (o.Key && o.LastModified) objects.push({ key: o.Key, lastModified: o.LastModified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

function classify(objects, rowKeys, nowMs, minAgeMs) {
  const objectKeys = new Set(objects.map((o) => o.key));
  const orphans = objects.filter(
    (o) => !rowKeys.has(o.key) && nowMs - o.lastModified.getTime() >= minAgeMs,
  );
  const dangling = [...rowKeys].filter((k) => !objectKeys.has(k));
  return { orphans, dangling };
}

const objects = await listAllObjects();
const rows = await prisma.credentialDoc.findMany({ select: { id: true, s3Key: true } });
const rowKeys = new Set(rows.map((r) => r.s3Key));
const { orphans, dangling } = classify(objects, rowKeys, Date.now(), MIN_AGE_HOURS * 3_600_000);

console.log(
  `sweep: ${objects.length} object(s), ${rows.length} row(s); ` +
    `${orphans.length} orphan(s) ≥${MIN_AGE_HOURS}h old, ${dangling.length} dangling row(s)`,
);
for (const o of orphans) {
  const ageH = ((Date.now() - o.lastModified.getTime()) / 3_600_000).toFixed(1);
  console.log(`  orphan: ${o.key} (age ${ageH}h)`);
}
for (const k of dangling) {
  const row = rows.find((r) => r.s3Key === k);
  console.log(`  dangling row (NOT touched — policy open): doc ${row.id} → missing object`);
}

let failed = 0;
if (!DELETE) {
  if (orphans.length) console.log("dry run — nothing removed. Re-run with --delete to remove the orphans above.");
} else {
  let deleted = 0;
  for (const o of orphans) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: o.key }));
      deleted++;
    } catch (err) {
      failed++;
      console.error(`  delete FAILED: ${o.key} (${err.name ?? "UnknownError"})`);
    }
  }
  console.log(`deleted ${deleted} orphan(s)${failed ? `, ${failed} failed` : ""}`);
}

await prisma.$disconnect();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Syntax check** — `node --check scripts/sweep-orphan-credentials.mjs`. Expected: silent.
- [ ] **Step 3: Commit** — `[ai-assisted] ops: sweep-orphan-credentials script — dry-run default, --delete, 24h age gate, dangling rows report-only (V-2; no rules touched)` (+ standard trailer)

---

### Task 2: Live rehearsal

- [ ] **Step 1: Stack up** — `colima start && docker compose up -d postgres minio` (postgres + minio only — hardware law).
- [ ] **Step 2: Ensure a legit doc exists** — `node --env-file=.env.local scripts/demo-credential-drive.mjs` (idempotent per HANDOFF; if it needs a claim first, run `node --env-file=.env.local scripts/demo-booking-drive.mjs` per its header).
- [ ] **Step 3: Plant one orphan** — small inline node script PUTs `credentials/rehearsal-orphan/orphan1.pdf` directly via the same createRequire S3 client (no DB row).
- [ ] **Step 4: Dry-run** — `node --env-file=.env.local scripts/sweep-orphan-credentials.mjs --min-age-hours 0`. Expected: lists exactly the planted key as orphan; legit doc NOT listed; "dry run — nothing removed".
- [ ] **Step 5: Delete** — same command + `--delete`. Expected: `deleted 1 orphan(s)`, exit 0.
- [ ] **Step 6: Confirm** — re-run dry-run: 0 orphans; legit row still in postgres and its object still in minio (dangling count 0).
- [ ] **Step 7: Stack down** — `docker compose down && colima stop`.

---

### Task 3: Docs + closeout

**Files:**
- Modify: `HANDOFF.md` (the "Three follow-ups on the books" sentence, ~L58)

- [ ] **Step 1: Update HANDOFF** — change "an S3 lifecycle/orphan sweep for uploads that call begin but never confirm (pairs with the `TODO(account-deletion)` note in `schema.prisma`)," to "~~an S3 lifecycle/orphan sweep~~ (shipped 2026-09-13: `node --env-file=.env.local scripts/sweep-orphan-credentials.mjs` — dry-run default, `--delete` to remove, 24h age gate, dangling rows report-only; still pairs with the `TODO(account-deletion)` note in `schema.prisma`),"
- [ ] **Step 2: Gates** — `pnpm compliance:check` green.
- [ ] **Step 3: Commit** — `[ai-assisted] orphan sweep closeout: HANDOFF recipe, rehearsal verified (no rules touched)`
