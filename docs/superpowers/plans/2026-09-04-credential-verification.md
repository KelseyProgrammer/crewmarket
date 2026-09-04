# Credential Upload + Admin Verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crew upload credential documents to private presigned storage; an env-allowlisted admin flips the verified flag; claimed profiles surface DB credentials on the board and profile pages (V-1/V-2/V-3).

**Architecture:** MinIO (S3-compatible) in docker-compose for dev — code targets the S3 API via `@aws-sdk/client-s3` + presigner so the client's AWS bucket later is an env swap. New `CredentialDoc` table keyed by seed-profile UUID through `CrewProfileClaim`. Verified state is a `verifiedAt` timestamp only the admin action writes — no client-writable boolean exists. Spec: `docs/superpowers/specs/2026-09-04-credential-verification-design.md`.

**Tech Stack:** Next.js 15 server actions, Prisma 6/Postgres, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, MinIO, vitest (new, for `apps/web/lib`).

**Conventions that bind every task:** commit style `[ai-assisted] … (rule IDs)`; all new user-facing copy must pass `pnpm compliance:check` (M-1) — say "marketplace", never employment vocabulary; S3 keys and presigned URLs never in `console.*` (V-2); "verified" copy means document review, never competence (V-3).

---

### Task 1: MinIO service + env + deps + vitest scaffold

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add MinIO to docker-compose.yml**

Append to `services:` (keep the existing postgres block):

```yaml
  minio:
    image: minio/minio
    container_name: crewmarket-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: crewmarket
      MINIO_ROOT_PASSWORD: crewmarket-dev # local dev only; real AWS creds come from the client (env swap)
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10
```

And add `miniodata:` under `volumes:`. Also update the header comment: credential docs live in MinIO locally / S3 in prod (V-2), still never in Postgres.

- [ ] **Step 2: Add env vars to `.env.example`**

```bash
# Credential doc storage (V-2: private bucket, presigned-only). Dev = MinIO from
# docker-compose; production = client's AWS bucket (endpoint empty for real AWS).
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="credential-docs"
S3_ACCESS_KEY="crewmarket"
S3_SECRET_KEY="crewmarket-dev"
S3_FORCE_PATH_STYLE="true"
# Admin allowlist (V-1: verified flag is admin-set only). Comma-separated emails.
ADMIN_EMAILS="admin@example.com"
```

Copy the same block into root `.env.local` and `apps/web/.env.local` (gitignored — do not commit).

- [ ] **Step 3: Install deps + vitest**

```bash
pnpm add --filter web @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm add -D --filter web vitest
```

Add to `apps/web/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Start MinIO and verify**

```bash
docker compose up -d minio && sleep 5 && docker ps --filter name=crewmarket-minio --format '{{.Status}}'
```
Expected: `Up … (healthy)` (or `health: starting` — re-check after a few seconds).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example apps/web/package.json pnpm-lock.yaml
git commit -m "[ai-assisted] credential storage infra: MinIO service, S3 env surface, web vitest (V-2; no rules touched)"
```

---

### Task 2: `CredentialDoc` model + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the model** (after `CrewProfileClaim`)

```prisma
// ---------- Credential Verification (SOW 2.i, V-1/V-2) ----------
// The document itself lives in private S3/MinIO, presigned-only (V-2); this row
// is the structured record. Verification state is verifiedAt — a timestamp only
// the admin action writes. There is deliberately no client-writable boolean, so
// self-set verification is structurally impossible (V-1). Nothing medical (D-1).

model CredentialDoc {
  id               String    @id @default(cuid())
  profileId        String // seed registry profile; uploader must hold its CrewProfileClaim
  uploadedByUserId String
  uploadedBy       User      @relation("UserCredentialDocs", fields: [uploadedByUserId], references: [id], onDelete: Cascade)
  kind             String // Credential.kind values from packages/types only
  licenseClass     String?
  expiresAt        DateTime?
  s3Key            String    @unique // never logged (V-2)
  contentType      String
  sizeBytes        Int
  uploadedAt       DateTime  @default(now())
  verifiedAt       DateTime? // null = self-reported (V-1)
  verifiedByEmail  String?

  @@index([profileId])
  @@map("credential_doc")
}
```

And on `model User`, add the back-relation line next to `bookings`:

```prisma
  credentialDocs CredentialDoc[] @relation("UserCredentialDocs")
```

- [ ] **Step 2: Migrate + generate**

```bash
cd packages/db && npx prisma migrate dev --name credential_doc && npx prisma migrate status
```
Expected: new migration created + applied; status "Database schema is up to date!".

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma
git commit -m "[ai-assisted] CredentialDoc model — verifiedAt-only verification state (V-1, V-2, D-1; no rules touched)"
```

---

### Task 3: Pure rules module (TDD)

**Files:**
- Create: `apps/web/lib/credential-rules.ts`
- Test: `apps/web/lib/credential-rules.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_KINDS,
  MAX_UPLOAD_BYTES,
  extensionFor,
  isAdminEmail,
  s3KeyFor,
  validateUpload,
} from "./credential-rules";

describe("validateUpload", () => {
  it("accepts pdf/jpeg/png within the size cap", () => {
    expect(validateUpload("application/pdf", 1024)).toBeNull();
    expect(validateUpload("image/jpeg", 1024)).toBeNull();
    expect(validateUpload("image/png", MAX_UPLOAD_BYTES)).toBeNull();
  });
  it("rejects other content types", () => {
    expect(validateUpload("image/gif", 10)).toMatch(/PDF, JPEG, or PNG/);
    expect(validateUpload("application/pdf; charset=x", 10)).toMatch(/PDF, JPEG, or PNG/);
  });
  it("rejects oversize and empty files", () => {
    expect(validateUpload("application/pdf", MAX_UPLOAD_BYTES + 1)).toMatch(/10 MB/);
    expect(validateUpload("application/pdf", 0)).toMatch(/empty/i);
  });
});

describe("s3KeyFor", () => {
  it("builds credentials/{profileId}/{docId}.{ext} — extension from content type, never the filename", () => {
    expect(s3KeyFor("p-1", "abc", "application/pdf")).toBe("credentials/p-1/abc.pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
  });
});

describe("isAdminEmail", () => {
  it("matches against the comma-separated allowlist, case-insensitive, trimmed", () => {
    const list = "ops@crewmarket.test, Admin@Example.com";
    expect(isAdminEmail("admin@example.com", list)).toBe(true);
    expect(isAdminEmail("ops@crewmarket.test", list)).toBe(true);
    expect(isAdminEmail("mate@example.com", list)).toBe(false);
  });
  it("empty or missing allowlist admits nobody", () => {
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false);
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
    expect(isAdminEmail("", "a@b.c")).toBe(false);
  });
});

describe("CREDENTIAL_KINDS", () => {
  it("is exactly the packages/types Credential kinds — no medical kinds ever (D-1)", () => {
    expect(CREDENTIAL_KINDS).toEqual([
      "USCG_OUPV", "USCG_MASTER_25_50_100", "STCW_BASIC",
      "CPR_FIRST_AID", "TWIC", "STATE_CHARTER_LICENSE", "OTHER",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd apps/web && pnpm test` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/* Pure upload/verification rules — no I/O so they are unit-testable.
   V-2: keys derive from validated content type, never the client filename.
   V-1: admin allowlist is env-driven; empty list admits nobody. */

import { Credential } from "@crewmarket/types";

export const CREDENTIAL_KINDS = Credential.shape.kind.options;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function extensionFor(contentType: string): string | null {
  return EXTENSIONS[contentType] ?? null;
}

/** Null when acceptable; otherwise a user-facing error string. */
export function validateUpload(contentType: string, sizeBytes: number): string | null {
  if (!extensionFor(contentType)) return "Upload a PDF, JPEG, or PNG.";
  if (sizeBytes <= 0) return "That file looks empty.";
  if (sizeBytes > MAX_UPLOAD_BYTES) return "Files are capped at 10 MB.";
  return null;
}

export function s3KeyFor(profileId: string, docId: string, contentType: string): string {
  return `credentials/${profileId}/${docId}.${extensionFor(contentType)}`;
}

export function isAdminEmail(email: string, allowlist: string | undefined): boolean {
  if (!email || !allowlist) return false;
  return allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
```

(`Credential.shape.kind.options` reads the kind list straight from the Zod schema in `packages/types` — single source of truth. If TS complains about the type, `Credential.shape.kind.options as readonly string[]`.)

- [ ] **Step 4: Run to verify pass** — `cd apps/web && pnpm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/credential-rules.ts apps/web/lib/credential-rules.test.ts
git commit -m "[ai-assisted] credential rules: content-type/size validation, key builder, admin allowlist (V-1, V-2, D-1)"
```

---

### Task 4: Storage helper (server-only, thin — verified live in Task 8)

**Files:**
- Create: `apps/web/lib/credential-storage.ts`

- [ ] **Step 1: Implement**

```ts
import "server-only";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/* Credential doc storage (V-2): private bucket, presigned-only, short expiries.
   MinIO in dev; the client's AWS bucket later is an env swap (S3_ENDPOINT unset).
   Never log keys or URLs from this module. */

const BUCKET = process.env.S3_BUCKET ?? "credential-docs";

const client = new S3Client({
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  bucketReady ??= client
    .send(new CreateBucketCommand({ Bucket: BUCKET }))
    .then(() => undefined)
    .catch((err: { name?: string }) => {
      if (err.name === "BucketAlreadyOwnedByYou" || err.name === "BucketAlreadyExists") return;
      bucketReady = null; // retry on next call rather than caching the failure
      throw err;
    });
  return bucketReady;
}

const PUT_EXPIRY_S = 60;
const GET_EXPIRY_S = 60;

export async function presignedPut(key: string, contentType: string, sizeBytes: number): Promise<string> {
  await ensureBucket();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: PUT_EXPIRY_S }
  );
}

export async function presignedGet(key: string): Promise<string> {
  await ensureBucket();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: GET_EXPIRY_S,
  });
}

/** Confirms the client's PUT actually landed; returns real size/type or null. */
export async function headObject(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
  await ensureBucket();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await ensureBucket();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => undefined);
}
```

- [ ] **Step 2: Typecheck via build** — `pnpm build` from repo root → green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/credential-storage.ts
git commit -m "[ai-assisted] presigned storage helper — private bucket, 60s URLs, HeadObject confirm (V-2)"
```

---

### Task 5: Crew upload flow — actions + account section

**Files:**
- Create: `apps/web/app/account/credential-actions.ts`
- Create: `apps/web/app/account/credentials-section.tsx`
- Create: `apps/web/app/account/credential-upload-form.tsx`
- Modify: `apps/web/app/account/page.tsx` (render section in CREW branch; drop CREDENTIALS from `SHELLS.CREW.upcoming`)

- [ ] **Step 1: Server actions** (`credential-actions.ts`)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@crewmarket/db";
import { claimedProfileId, sessionUser } from "../../lib/bookings";
import { CREDENTIAL_KINDS, s3KeyFor, validateUpload } from "../../lib/credential-rules";
import { deleteObject, headObject, presignedPut } from "../../lib/credential-storage";

/* Upload protocol: begin → client PUTs to the presigned URL → confirm.
   The DB row is created at confirm, after HeadObject proves the object exists
   and matches what was authorized — no orphan rows, no trusting client metadata.
   Every action re-checks session + claim (V-1). Nothing here logs keys (V-2). */

async function requireClaimedProfile() {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/account");
  if (user.accountType !== "CREW") return { error: "Only crew accounts upload credentials." } as const;
  const profileId = await claimedProfileId(user.id);
  if (!profileId) return { error: "Your account isn't linked to a board profile yet." } as const;
  return { user, profileId } as const;
}

export type BeginUploadResult =
  | { error: string }
  | { putUrl: string; docId: string; s3Key: string };

export async function beginCredentialUpload(input: {
  kind: string;
  contentType: string;
  sizeBytes: number;
}): Promise<BeginUploadResult> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return { error: ctx.error };
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose a credential type from the list." };
  }
  const invalid = validateUpload(input.contentType, input.sizeBytes);
  if (invalid) return { error: invalid };

  const docId = createId();
  const s3Key = s3KeyFor(ctx.profileId, docId, input.contentType);
  const putUrl = await presignedPut(s3Key, input.contentType, input.sizeBytes);
  return { putUrl, docId, s3Key };
}

export type ConfirmUploadResult = { error?: string };

export async function confirmCredentialUpload(input: {
  docId: string;
  s3Key: string;
  kind: string;
  licenseClass?: string;
  expiresAt?: string; // "YYYY-MM-DD"
}): Promise<ConfirmUploadResult> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return { error: ctx.error };
  // The key encodes the profile — reject confirms for keys this claim doesn't own.
  if (!input.s3Key.startsWith(`credentials/${ctx.profileId}/`)) {
    return { error: "That upload doesn't belong to your profile." };
  }
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose a credential type from the list." };
  }
  const head = await headObject(input.s3Key);
  if (!head) return { error: "Upload didn't complete — try again." };
  const invalid = validateUpload(head.contentType, head.sizeBytes);
  if (invalid) return { error: invalid };

  const expiresAt =
    input.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)
      ? new Date(input.expiresAt + "T00:00:00Z")
      : null;

  await prisma.credentialDoc.create({
    data: {
      id: input.docId,
      profileId: ctx.profileId,
      uploadedByUserId: ctx.user.id,
      kind: input.kind,
      licenseClass: input.licenseClass?.trim() || null,
      expiresAt,
      s3Key: input.s3Key,
      contentType: head.contentType,
      sizeBytes: head.sizeBytes,
      // verifiedAt deliberately absent: every new upload is self-reported (V-1)
    },
  });
  revalidatePath("/account");
  return {};
}

export async function deleteCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return;
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  if (!doc || doc.profileId !== ctx.profileId) return;
  await prisma.credentialDoc.delete({ where: { id: doc.id } });
  await deleteObject(doc.s3Key);
  revalidatePath("/account");
}

/** Owner-only short-lived view of their own document (V-2). */
export async function viewOwnCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) return;
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  if (!doc || doc.profileId !== ctx.profileId) return;
  const { presignedGet } = await import("../../lib/credential-storage");
  redirect(await presignedGet(doc.s3Key));
}
```

Install the id dep first: `pnpm add --filter web @paralleldrive/cuid2`.

- [ ] **Step 2: Upload form (client component)** (`credential-upload-form.tsx`)

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { beginCredentialUpload, confirmCredentialUpload } from "./credential-actions";

/* Three-step upload: authorize (server) → PUT directly to storage → confirm
   (server re-verifies via HeadObject). The file never passes through our
   server process; only the presigned URL touches it (V-2). */

export function CredentialUploadForm({ kinds }: { kinds: readonly string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File | null;
    if (!file || file.size === 0) return setError("Choose a file.");
    setError(null);
    startTransition(async () => {
      const begin = await beginCredentialUpload({
        kind: String(data.get("kind")),
        contentType: file.type,
        sizeBytes: file.size,
      });
      if ("error" in begin) return setError(begin.error);
      const put = await fetch(begin.putUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) return setError("Upload didn't complete — try again.");
      const confirm = await confirmCredentialUpload({
        docId: begin.docId,
        s3Key: begin.s3Key,
        kind: String(data.get("kind")),
        licenseClass: String(data.get("licenseClass") ?? ""),
        expiresAt: String(data.get("expiresAt") ?? ""),
      });
      if (confirm.error) return setError(confirm.error);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} className="credform" onSubmit={onSubmit}>
      <label>
        Credential type
        <select name="kind" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {kinds.map((k) => (
            <option key={k} value={k}>{k.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <label>
        License class <span className="credform__opt">(optional)</span>
        <input name="licenseClass" type="text" placeholder="e.g. Master 100T" />
      </label>
      <label>
        Expires <span className="credform__opt">(optional)</span>
        <input name="expiresAt" type="date" />
      </label>
      <label>
        Document (PDF, JPEG, or PNG — max 10 MB)
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
      </label>
      {error ? <p className="credform__error" role="alert">{error}</p> : null}
      <button className="btn btn--brass" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload for review"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Credentials section (server component)** (`credentials-section.tsx`)

```tsx
import { prisma } from "@crewmarket/db";
import { claimedProfileId } from "../../lib/bookings";
import { CREDENTIAL_KINDS } from "../../lib/credential-rules";
import { CredentialUploadForm } from "./credential-upload-form";
import { deleteCredentialDoc, viewOwnCredentialDoc } from "./credential-actions";

/* V-1: verified vs self-reported visually distinct. V-3: verified wording is
   about document review, never competence. Docs are owner/admin-visible only —
   the public profile shows structured fields, never the file (V-2). */

const KIND_LABELS: Record<string, string> = {
  USCG_OUPV: "USCG OUPV (6-pack)",
  USCG_MASTER_25_50_100: "USCG Master",
  STCW_BASIC: "STCW Basic Training",
  CPR_FIRST_AID: "CPR / First Aid",
  TWIC: "TWIC",
  STATE_CHARTER_LICENSE: "State Charter License",
  OTHER: "Other credential",
};

export async function CredentialsSection({ userId }: { userId: string }) {
  const profileId = await claimedProfileId(userId);
  if (!profileId) return null; // no claim, no upload surface — the account shell copy covers this

  const docs = await prisma.credentialDoc.findMany({
    where: { profileId },
    orderBy: { uploadedAt: "desc" },
  });

  return (
    <div className="account__panel">
      <span className="eyebrow">CREDENTIALS</span>
      <p className="account__lede">
        Upload license and certification documents for admin review. Verification means an
        admin reviewed the document — the brass seal is earned, never self-set. Documents
        stay private; your public listing shows only the credential details.
      </p>
      {docs.length > 0 ? (
        <ul className="credlist">
          {docs.map((d) => (
            <li key={d.id} className="credlist__row">
              <span className="credlist__kind">{KIND_LABELS[d.kind] ?? d.kind}</span>
              {d.licenseClass ? <span className="credlist__class">{d.licenseClass}</span> : null}
              {d.expiresAt ? (
                <span className="credlist__exp">
                  expires {d.expiresAt.toISOString().slice(0, 10)}
                </span>
              ) : null}
              <span className={d.verifiedAt ? "credlist__state credlist__state--verified" : "credlist__state"}>
                {d.verifiedAt ? "Verified — document reviewed" : "Self-reported — awaiting review"}
              </span>
              <form action={viewOwnCredentialDoc}>
                <input type="hidden" name="docId" value={d.id} />
                <button className="btn btn--ghost-ink" type="submit">View</button>
              </form>
              <form action={deleteCredentialDoc}>
                <input type="hidden" name="docId" value={d.id} />
                <button className="btn btn--ghost-ink" type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="credlist__empty">No documents uploaded yet.</p>
      )}
      <CredentialUploadForm kinds={CREDENTIAL_KINDS as readonly string[]} />
    </div>
  );
}
```

- [ ] **Step 4: Wire into the account page**

In `apps/web/app/account/page.tsx`: import `{ CredentialsSection }` from `./credentials-section`; in `SHELLS.CREW.upcoming` remove the `["CREDENTIALS", …]` row (it is now live); render `{accountType === "CREW" ? <CredentialsSection userId={session.user.id} /> : null}` between the live-action panel and the upcoming panel.

- [ ] **Step 5: Verify** — `pnpm build` green; `pnpm compliance:check` green (new copy). Manual: `pnpm dev`, sign in as `mate@example.com` (demo claim from `scripts/demo-booking-drive.mjs`), upload a small PDF, see "Self-reported — awaiting review", View opens the doc, Remove deletes it.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/account apps/web/package.json pnpm-lock.yaml
git commit -m "[ai-assisted] crew credential upload — begin/PUT/confirm presigned protocol, owner-only view/remove (V-1, V-2, V-3, M-1 copy)"
```

---

### Task 6: Admin page + verify toggle

**Files:**
- Create: `apps/web/app/admin/credentials/page.tsx`
- Create: `apps/web/app/admin/credentials/actions.ts`

- [ ] **Step 1: Actions** (`actions.ts`)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import { sessionUser } from "../../../lib/bookings";
import { isAdminEmail } from "../../../lib/credential-rules";
import { presignedGet } from "../../../lib/credential-storage";

/* V-1: the ONLY code path that writes verifiedAt. Allowlist re-checked in every
   action, not just the page. SOW 2.ii: flag + view only, no review tooling. */

async function requireAdmin() {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) return null;
  return user;
}

export async function setCredentialVerified(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const docId = String(formData.get("docId"));
  const verify = formData.get("verify") === "1";
  await prisma.credentialDoc.update({
    where: { id: docId },
    data: verify
      ? { verifiedAt: new Date(), verifiedByEmail: admin.email }
      : { verifiedAt: null, verifiedByEmail: null },
  });
  revalidatePath("/admin/credentials");
}

export async function viewCredentialDocAsAdmin(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const doc = await prisma.credentialDoc.findUnique({ where: { id: String(formData.get("docId")) } });
  if (!doc) return;
  redirect(await presignedGet(doc.s3Key));
}
```

- [ ] **Step 2: Page** (`page.tsx`)

```tsx
import { notFound } from "next/navigation";
import { Container } from "@crewmarket/ui";
import { prisma } from "@crewmarket/db";
import { crewProfileById, sessionUser } from "../../../lib/bookings";
import { isAdminEmail } from "../../../lib/credential-rules";
import { setCredentialVerified, viewCredentialDocAsAdmin } from "./actions";

/* Admin credential review (V-1). Gate = ADMIN_EMAILS env allowlist; page 404s
   for everyone else (route stays unadvertised — no nav link anywhere).
   Scope by rule: view + verified toggle, nothing more (SOW 2.ii). */

export const metadata = { title: "Credential review — Crew Market" };

export default async function AdminCredentials() {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) notFound();

  const docs = await prisma.credentialDoc.findMany({
    orderBy: [{ verifiedAt: { sort: "asc", nulls: "first" } }, { uploadedAt: "desc" }],
    include: { uploadedBy: { select: { email: true } } },
  });

  return (
    <main className="admincreds">
      <Container wide>
        <span className="eyebrow">ADMIN · CREDENTIAL REVIEW</span>
        <h1>Uploaded credential documents</h1>
        <p>
          Verifying means: the document exists and matches the listed name and details.
          It is a document review, not a competence assessment.
        </p>
        {docs.length === 0 ? (
          <p>No documents awaiting review.</p>
        ) : (
          <table className="admincreds__table">
            <thead>
              <tr>
                <th>Profile</th><th>Kind</th><th>Class</th><th>Expires</th>
                <th>Uploaded</th><th>By</th><th>State</th><th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{crewProfileById(d.profileId)?.displayName ?? d.profileId}</td>
                  <td>{d.kind}</td>
                  <td>{d.licenseClass ?? "—"}</td>
                  <td>{d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : "—"}</td>
                  <td>{d.uploadedAt.toISOString().slice(0, 10)}</td>
                  <td>{d.uploadedBy.email}</td>
                  <td>{d.verifiedAt ? "Verified" : "Self-reported"}</td>
                  <td className="admincreds__acts">
                    <form action={viewCredentialDocAsAdmin}>
                      <input type="hidden" name="docId" value={d.id} />
                      <button className="btn btn--ghost-ink" type="submit">View</button>
                    </form>
                    <form action={setCredentialVerified}>
                      <input type="hidden" name="docId" value={d.id} />
                      <input type="hidden" name="verify" value={d.verifiedAt ? "0" : "1"} />
                      <button className="btn btn--brass" type="submit">
                        {d.verifiedAt ? "Unverify" : "Verify"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Container>
    </main>
  );
}
```

(If Prisma rejects the `nulls` orderBy on the installed version, use `orderBy: [{ verifiedAt: "asc" }, { uploadedAt: "desc" }]` — unverified-first ordering is a nicety, not a requirement.)

- [ ] **Step 3: Verify** — with `ADMIN_EMAILS` unset or non-matching, `/admin/credentials` 404s; add your dev email, page lists the Task-5 upload; Verify flips the state shown on `/account` too. `pnpm build` + `pnpm compliance:check` green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin
git commit -m "[ai-assisted] admin credential review — env-allowlist gate, verify toggle is the only verifiedAt writer (V-1, V-2, V-3; SOW 2.ii scope)"
```

---

### Task 7: Public surfacing — profile + directory overrides

**Files:**
- Create: `apps/web/lib/credential-overrides.ts`
- Modify: `apps/web/app/crew/[id]/page.tsx`
- Modify: `apps/web/app/directory/page.tsx`

- [ ] **Step 1: Override data layer** (`credential-overrides.ts`)

```ts
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
```

- [ ] **Step 2: Profile page** — in `apps/web/app/crew/[id]/page.tsx`, after the profile lookup, override the credentials array:

```tsx
import { credentialsForProfile } from "../../../lib/credential-overrides";
```

and where the page currently derives from `crew.credentials` (the `const verified = crew.credentials.some(...)` block near line 73):

```tsx
  const dbCredentials = await credentialsForProfile(crew.id);
  const credentials = dbCredentials ?? crew.credentials;
  const verified = credentials.some((c) => c.verified);
  const license = credentials.find((c) => c.kind.startsWith("USCG") && c.licenseClass);
```

then replace every later use of `crew.credentials` in the render with `credentials`.

- [ ] **Step 3: Directory page** — in `apps/web/app/directory/page.tsx`:

```tsx
import { credentialOverrideMap } from "../../lib/credential-overrides";
```

after `const all = seed.profiles as unknown as CrewCardData[];`:

```tsx
  // Claimed profiles with uploaded docs show DB credential state — the board
  // never contradicts the profile page (V-1).
  const overrides = await credentialOverrideMap();
  const board = all.map((c) =>
    overrides.has(c.id) ? { ...c, credentials: overrides.get(c.id)! as CrewCardData["credentials"] } : c
  );
```

then change the two `all.filter`/`all.map` usages that feed results and ports to use `board` for `results` (`const results = board.filter(...)`) — `ports` can keep using `all`.

- [ ] **Step 4: Verify** — profile of the claimed demo crew shows DB credentials with the admin-set state; directory brass seal + verified-only filter agree; unclaimed profiles unchanged. `pnpm build`, `pnpm compliance:check`, `cd packages/ui && pnpm test` (12 pass), `cd apps/web && pnpm test` all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/credential-overrides.ts "apps/web/app/crew/[id]/page.tsx" apps/web/app/directory/page.tsx
git commit -m "[ai-assisted] claimed profiles surface DB credential state on profile + board (V-1, V-2, V-3)"
```

---

### Task 8: Demo drive script + docs

**Files:**
- Create: `scripts/demo-credential-drive.mjs`
- Modify: `HANDOFF.md`, `docs/SOW-AUDIT.md`

- [ ] **Step 1: Demo script** — seeds a tiny synthetic PDF through the real storage path so the whole loop is drivable without the browser:

```js
// demo-credential-drive.mjs — drive the credential loop with synthetic data (G-1).
// Run: node --env-file=.env.local scripts/demo-credential-drive.mjs
// Needs: docker compose up -d (postgres + minio), demo claim from demo-booking-drive.mjs.
import { PrismaClient } from "@prisma/client";
import { S3Client, CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();
const BUCKET = process.env.S3_BUCKET ?? "credential-docs";
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

// Minimal valid one-page PDF, generated bytes — synthetic, no real document (G-1).
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\nxref\n0 4\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF"
);

const claim = await prisma.crewProfileClaim.findFirst();
if (!claim) {
  console.error("No CrewProfileClaim found — run demo-booking-drive.mjs first.");
  process.exit(1);
}

await s3.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => undefined);
const docId = "demo-stcw-doc";
const key = `credentials/${claim.profileId}/${docId}.pdf`;
await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: PDF, ContentType: "application/pdf" }));

await prisma.credentialDoc.upsert({
  where: { id: docId },
  create: {
    id: docId,
    profileId: claim.profileId,
    uploadedByUserId: claim.userId,
    kind: "STCW_BASIC",
    expiresAt: new Date("2028-06-15T00:00:00Z"),
    s3Key: key,
    contentType: "application/pdf",
    sizeBytes: PDF.length,
  },
  update: { verifiedAt: null, verifiedByEmail: null },
});

console.log(`Seeded synthetic STCW doc for profile ${claim.profileId} (self-reported).`);
console.log("Verify it at /admin/credentials with an ADMIN_EMAILS session, then check /account and the profile page.");
await prisma.$disconnect();
```

Run it; expected: "Seeded synthetic STCW doc … (self-reported)."

- [ ] **Step 2: Update docs** —
`docs/SOW-AUDIT.md`: "Presigned non-public storage" row → ✅ (MinIO dev / env-swap AWS, presigned PUT+GET, V-2); "Admin-only `verified` flag" row → ✅ (`/admin/credentials`, ADMIN_EMAILS allowlist, verifiedAt-only).
`HANDOFF.md`: add a Current state bullet: credential phase shipped (upload → admin verify → board/profile surfacing; MinIO in compose — `docker compose up -d`; `ADMIN_EMAILS` + S3 vars in `.env.local`; demo: `node --env-file=.env.local scripts/demo-credential-drive.mjs`).

- [ ] **Step 3: Final gates** — from repo root: `pnpm compliance:check` && `pnpm lint` && `cd apps/web && pnpm test` && `cd ../packages/ui && pnpm test` && `pnpm build` — all green.

- [ ] **Step 4: Commit + push**

```bash
git add scripts/demo-credential-drive.mjs HANDOFF.md docs/SOW-AUDIT.md
git commit -m "[ai-assisted] credential demo drive + handoff/audit updates (V-1, V-2, G-1; no rules touched)"
git push origin main
```
