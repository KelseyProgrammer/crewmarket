# Mobile Slice 4 — Crew Credential Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crew can list, upload (camera / photo library / file), view, and remove credential documents from the Expo app, via new REST routes wrapping the existing server-side upload protocol.

**Architecture:** Extract the credential guard/begin/confirm/delete/view logic out of the web server actions into a shared `apps/web/lib/credential-service.ts`; the server actions and five new `/api/credentials*` routes become thin wrappers (one home for the V-1/V-2 guards). Mobile gets a dedicated `credentials` screen pushed from the Account tab, using the established `authClient.$fetch` + tokens design system patterns from slices 1–3.

**Tech Stack:** Next.js 15 route handlers, Prisma, AWS SDK presigned URLs (MinIO dev), vitest; Expo SDK 57 (expo-router, expo-image-picker, expo-document-picker, expo-file-system legacy `uploadAsync`, expo-web-browser), Better Auth Expo client.

**Spec:** `docs/superpowers/specs/2026-09-19-mobile-slice4-credential-upload-design.md`

**Process rules (slice-3 lessons):** ONE agent per working tree, tasks strictly sequential, verify each agent actually terminated. Web tsconfig is `strict:false` — boolean-discriminant narrowing does NOT work; always narrow unions with the `in` operator; `pnpm build` is the only gate that catches this class.

**Commit style:** `[ai-assisted]` + rule IDs, e.g. `(V-1, V-2)`, suffix `(no rules touched)` when COMPLIANCE.md is untouched (always, in this plan).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/lib/credential-service.ts` | Create | THE home for guard + begin/confirm/delete/view/list logic |
| `apps/web/app/account/credential-actions.ts` | Modify | Becomes thin web wrappers (redirect/revalidate only) |
| `apps/web/app/account/credentials-section.tsx` | Modify | List via `listDocs()` instead of inline prisma |
| `apps/web/app/api/credentials/route.ts` (+`.test.ts`) | Create | GET list |
| `apps/web/app/api/credentials/begin/route.ts` (+`.test.ts`) | Create | POST begin |
| `apps/web/app/api/credentials/confirm/route.ts` (+`.test.ts`) | Create | POST confirm |
| `apps/web/app/api/credentials/[id]/route.ts` (+`.test.ts`) | Create | DELETE |
| `apps/web/app/api/credentials/[id]/view/route.ts` (+`.test.ts`) | Create | POST → short-lived view URL |
| `apps/mobile/lib/credential-labels.ts` (+`.test.ts`) | Create | Kind/state labels (mirror web copy exactly) |
| `apps/mobile/lib/credential-upload.ts` (+`.test.ts`) | Create | Pure client validation + shared client types |
| `apps/mobile/src/app/credentials.tsx` | Create | The screen: list / view / remove / add |
| `apps/mobile/src/app/(tabs)/account.tsx` | Modify | "Credentials" row → `/credentials` |
| `apps/mobile/app.json` | Modify | expo-image-picker permission plugin |
| `HANDOFF.md` | Modify | Slice-4 status line |

---

### Task 1: Extract `credential-service.ts` (web behavior unchanged)

The existing guard tests are the safety net: they mock `../../lib/bookings`, `../../lib/credential-storage`, `@crewmarket/db`, and `next/navigation` — all of which the service will import through the same module ids, so the mocks keep applying. **They must pass unchanged; a failing test is a real guard gap, never a test to loosen.**

**Files:**
- Create: `apps/web/lib/credential-service.ts`
- Modify: `apps/web/app/account/credential-actions.ts`
- Modify: `apps/web/app/account/credentials-section.tsx`
- Test (existing, unchanged): `apps/web/app/account/credential-actions.test.ts`

- [ ] **Step 1: Baseline — run the existing guard tests, confirm green**

Run: `pnpm --filter web test -- app/account/credential-actions.test.ts`
Expected: all tests PASS (14 tests).

- [ ] **Step 2: Create `apps/web/lib/credential-service.ts`**

Logic moves **verbatim** from `credential-actions.ts` — do not "improve" any guard.

```ts
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@crewmarket/db";
import { claimedProfileId, sessionUser } from "./bookings";
import { CREDENTIAL_KINDS, s3KeyFor, validateUpload } from "./credential-rules";
import { deleteObject, headObject, presignedGet, presignedPut } from "./credential-storage";

/* Shared credential service — the ONE home for the V-1/V-2 upload/delete/view
   guards. apps/web/app/account/credential-actions.ts (web forms) and the
   /api/credentials/* routes (mobile) are both thin wrappers around these
   functions; never re-implement a guard in a wrapper. No redirect/revalidate
   here — callers translate errors to their surface. Never log keys or URLs. */

export type CredentialCtx = { user: { id: string }; profileId: string };
export type GuardFailure = { error: string; status: 401 | 403 };

export async function credentialGuard(): Promise<CredentialCtx | GuardFailure> {
  const user = await sessionUser();
  if (!user) return { error: "sign in required", status: 401 };
  const u = user as { id: string; accountType?: string };
  if (u.accountType !== "CREW") return { error: "Only crew accounts upload credentials.", status: 403 };
  const profileId = await claimedProfileId(u.id);
  if (!profileId) return { error: "Your account isn't linked to a board profile yet.", status: 403 };
  return { user: { id: u.id }, profileId };
}

/** Owner-facing list projection — s3Key deliberately not selected (V-2). */
export async function listDocs(profileId: string) {
  return prisma.credentialDoc.findMany({
    where: { profileId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      kind: true,
      licenseClass: true,
      expiresAt: true,
      uploadedAt: true,
      verifiedAt: true,
    },
  });
}

export type BeginUploadResult =
  | { error: string }
  | { putUrl: string; docId: string; s3Key: string };

export async function beginUpload(
  ctx: CredentialCtx,
  input: { kind: string; contentType: string; sizeBytes: number },
): Promise<BeginUploadResult> {
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

export async function confirmUpload(
  ctx: CredentialCtx,
  input: {
    docId: string;
    s3Key: string;
    kind: string;
    licenseClass?: string;
    expiresAt?: string; // "YYYY-MM-DD"
  },
): Promise<ConfirmUploadResult> {
  // Cheap pre-HeadObject guard — the key encodes the profile, so this rejects
  // foreign keys before we spend a HeadObject call on them.
  if (!input.s3Key.startsWith(`credentials/${ctx.profileId}/`)) {
    return { error: "That upload doesn't belong to your profile." };
  }
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose a credential type from the list." };
  }

  const licenseClass = input.licenseClass?.trim() || null;
  if (licenseClass && licenseClass.length > 80) {
    return { error: "License class is capped at 80 characters." };
  }
  if (licenseClass && !/^[A-Za-z0-9 ./-]+$/.test(licenseClass)) {
    return { error: "License class can use letters, numbers, spaces, . / - only." };
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) return { error: "Enter a valid expiry date." };
    const d = new Date(input.expiresAt + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.expiresAt) {
      return { error: "Enter a valid expiry date." };
    }
    expiresAt = d;
  }

  const head = await headObject(input.s3Key);
  if (!head) return { error: "Upload didn't complete — try again." };
  const invalid = validateUpload(head.contentType, head.sizeBytes);
  if (invalid) {
    await deleteObject(input.s3Key).catch(() => undefined); // don't leave a rejected upload in the bucket
    return { error: invalid };
  }

  // Bind id ↔ key ↔ stored content type: recomputing the key validates docId shape
  // (s3KeyFor throws on malformed ids) and rejects any client-tampered pairing.
  let expectedKey: string;
  try {
    expectedKey = s3KeyFor(ctx.profileId, input.docId, head.contentType);
  } catch {
    return { error: "That upload doesn't match your profile." };
  }
  if (expectedKey !== input.s3Key) return { error: "That upload doesn't match your profile." };

  try {
    await prisma.credentialDoc.create({
      data: {
        id: input.docId,
        profileId: ctx.profileId,
        uploadedByUserId: ctx.user.id,
        kind: input.kind,
        licenseClass,
        expiresAt,
        s3Key: input.s3Key,
        contentType: head.contentType,
        sizeBytes: head.sizeBytes,
        // verifiedAt deliberately absent: every new upload is self-reported (V-1)
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { error: "That document was already saved." };
    throw err;
  }
  return {};
}

/** Uploader-bound removal (V-2). Denial reads as "not found" — existence stays hidden. */
export async function deleteDoc(
  ctx: CredentialCtx,
  docId: string,
): Promise<{ error?: string; status?: number }> {
  const doc = await prisma.credentialDoc.findUnique({ where: { id: docId } });
  // uploader-bound, not just claim-bound: a re-assigned claim must never expose the previous person's documents (V-2)
  if (!doc || doc.profileId !== ctx.profileId || doc.uploadedByUserId !== ctx.user.id) {
    return { error: "not found", status: 404 };
  }
  await deleteObject(doc.s3Key); // S3 first — if this throws, the row survives and Remove can be retried (V-2)
  await prisma.credentialDoc.delete({ where: { id: doc.id } });
  return {};
}

/** Owner-only short-lived view URL for their own document (V-2). */
export async function viewDocUrl(
  ctx: CredentialCtx,
  docId: string,
): Promise<{ url: string } | { error: string; status: number }> {
  const doc = await prisma.credentialDoc.findUnique({ where: { id: docId } });
  // uploader-bound, not just claim-bound: a re-assigned claim must never expose the previous person's documents (V-2)
  if (!doc || doc.profileId !== ctx.profileId || doc.uploadedByUserId !== ctx.user.id) {
    return { error: "not found", status: 404 };
  }
  return { url: await presignedGet(doc.s3Key) };
}
```

- [ ] **Step 3: Rewrite `apps/web/app/account/credential-actions.ts` as thin wrappers**

Replace the whole file. Exported names and result shapes are unchanged (`credential-upload-form.tsx` imports `beginCredentialUpload`/`confirmCredentialUpload`; the section uses the two form actions).

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  beginUpload,
  confirmUpload,
  credentialGuard,
  deleteDoc,
  viewDocUrl,
  type CredentialCtx,
} from "../../lib/credential-service";

/* Thin web-form wrappers around lib/credential-service — the ONE home for the
   V-1/V-2 guards. This file adds only web concerns: redirects and cache
   revalidation. Never add a guard here; add it to the service. */

async function requireClaimedProfile(): Promise<CredentialCtx | { error: string }> {
  const guard = await credentialGuard();
  if ("status" in guard && guard.status === 401) redirect("/sign-in?from=/account");
  if ("status" in guard) return { error: guard.error };
  return guard;
}

function revalidateCredentialSurfaces(profileId: string) {
  revalidatePath("/account");
  revalidatePath(`/crew/${profileId}`);
  revalidatePath("/directory");
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
  return beginUpload(ctx, input);
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
  const r = await confirmUpload(ctx, input);
  if (r.error) return r;
  revalidateCredentialSurfaces(ctx.profileId);
  return {};
}

export async function deleteCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) redirect("/account?cred=denied");
  const r = await deleteDoc(ctx, String(formData.get("docId")));
  if (r.error) redirect("/account?cred=denied");
  revalidateCredentialSurfaces(ctx.profileId);
}

/** Owner-only short-lived view of their own document (V-2). */
export async function viewOwnCredentialDoc(formData: FormData): Promise<void> {
  const ctx = await requireClaimedProfile();
  if ("error" in ctx) redirect("/account?cred=denied");
  const r = await viewDocUrl(ctx, String(formData.get("docId")));
  if ("error" in r) redirect("/account?cred=denied");
  redirect(r.url);
}
```

Note the narrowing style: `"status" in guard` / `"error" in ctx` — the `in` operator, never a boolean discriminant (strict:false).

- [ ] **Step 4: Run the existing tests — must pass UNCHANGED**

Run: `pnpm --filter web test -- app/account/credential-actions.test.ts`
Expected: all 14 PASS with zero edits to the test file. If any fail, the extraction changed behavior — fix the extraction, not the test.

- [ ] **Step 5: Swap `credentials-section.tsx` to `listDocs`**

In `apps/web/app/account/credentials-section.tsx`, replace the inline `prisma.credentialDoc.findMany({...})` call (and its now-unused `prisma` import) with:

```ts
import { listDocs } from "../../lib/credential-service";
```

```ts
  const docs = await listDocs(profileId);
```

Everything else in the file stays as-is (same selected fields, same rendering).

- [ ] **Step 6: Build + full web test suite**

Run: `pnpm --filter web test && pnpm build`
Expected: all tests PASS; build green (catches any narrowing mistakes).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/credential-service.ts apps/web/app/account/credential-actions.ts apps/web/app/account/credentials-section.tsx
git commit -m "[ai-assisted] refactor: extract credential-service — one home for V-1/V-2 guards; actions become thin wrappers (V-1, V-2) (no rules touched)"
```

---

### Task 2: `GET /api/credentials` route

**Files:**
- Create: `apps/web/app/api/credentials/route.ts`
- Test: `apps/web/app/api/credentials/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* GET /api/credentials — the caller's own doc list (V-2: no s3Key in the
   payload, ever). Guard: 401 signed out, 403 non-crew/unclaimed — same
   credentialGuard the web actions use. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { findMany: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: vi.fn(),
  presignedGet: vi.fn(),
  deleteObject: vi.fn(),
}));

import { GET } from "./route";

const CREW = { id: "u1", accountType: "CREW" };

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue(CREW);
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("GET /api/credentials", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 for BOAT accounts", async () => {
    seams.sessionUser.mockResolvedValue({ id: "u2", accountType: "BOAT" });
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/crew accounts/);
  });

  it("403 for crew without a claimed profile", async () => {
    seams.claimedProfileId.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
  });

  it("maps docs to the wire shape — dates as YYYY-MM-DD, verified boolean, never s3Key", async () => {
    seams.prisma.credentialDoc.findMany.mockResolvedValue([
      {
        id: "d1",
        kind: "TWIC",
        licenseClass: null,
        expiresAt: new Date("2027-01-15T00:00:00Z"),
        uploadedAt: new Date("2026-09-19T12:00:00Z"),
        verifiedAt: new Date("2026-09-20T12:00:00Z"),
      },
      {
        id: "d2",
        kind: "OTHER",
        licenseClass: "Master 100T",
        expiresAt: null,
        uploadedAt: new Date("2026-09-18T12:00:00Z"),
        verifiedAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const { docs } = await res.json();
    expect(docs).toEqual([
      { id: "d1", kind: "TWIC", licenseClass: null, expiresAt: "2027-01-15", uploadedAt: "2026-09-19", verified: true },
      { id: "d2", kind: "OTHER", licenseClass: "Master 100T", expiresAt: null, uploadedAt: "2026-09-18", verified: false },
    ]);
    expect(JSON.stringify(docs)).not.toContain("s3Key");
    // the select itself must exclude s3Key (V-2)
    const select = seams.prisma.credentialDoc.findMany.mock.calls[0]![0].select;
    expect(Object.keys(select)).not.toContain("s3Key");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- app/api/credentials/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement `apps/web/app/api/credentials/route.ts`**

```ts
import { credentialGuard, listDocs } from "../../../lib/credential-service";

/* GET /api/credentials — the caller's own credential docs for the mobile
   account surface. Wire shape carries `verified` as a boolean only; verifiedAt
   stays server-side and admin-set (V-1). s3Key never leaves the server from
   this route (V-2). */

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await credentialGuard();
  if ("status" in guard) return Response.json({ error: guard.error }, { status: guard.status });

  const docs = await listDocs(guard.profileId);
  return Response.json({
    docs: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      licenseClass: d.licenseClass,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : null,
      uploadedAt: d.uploadedAt.toISOString().slice(0, 10),
      verified: Boolean(d.verifiedAt),
    })),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- app/api/credentials/route.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/credentials/route.ts apps/web/app/api/credentials/route.test.ts
git commit -m "[ai-assisted] feat: GET /api/credentials — own-doc list for mobile, verified as boolean, no s3Key on the wire (V-1, V-2) (no rules touched)"
```

---

### Task 3: `POST /api/credentials/begin` + `POST /api/credentials/confirm` routes

**Files:**
- Create: `apps/web/app/api/credentials/begin/route.ts`
- Create: `apps/web/app/api/credentials/confirm/route.ts`
- Test: `apps/web/app/api/credentials/begin/route.test.ts`
- Test: `apps/web/app/api/credentials/confirm/route.test.ts`

- [ ] **Step 1: Write the failing begin test** (`begin/route.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/credentials/begin — mobile's entry to the presigned upload
   protocol. Same beginUpload the web action wraps; guard failures are 401/403,
   validation failures 400. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  presignedPut: vi.fn(async () => "https://minio.test/put"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: {} }));
vi.mock("../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: seams.presignedPut,
  presignedGet: vi.fn(),
  deleteObject: vi.fn(),
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/credentials/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = { kind: "TWIC", contentType: "application/pdf", sizeBytes: 1234 };

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("POST /api/credentials/begin", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await POST(req(GOOD))).status).toBe(401);
  });

  it("400 on a malformed (non-JSON) body", async () => {
    const res = await POST(
      new Request("http://test/api/credentials/begin", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 with the service's error for a bad kind, before presigning", async () => {
    const res = await POST(req({ ...GOOD, kind: "FAKE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/credential type/);
    expect(seams.presignedPut).not.toHaveBeenCalled();
  });

  it("400 for an oversize file", async () => {
    const res = await POST(req({ ...GOOD, sizeBytes: 11 * 1024 * 1024 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 MB/);
  });

  it("happy path returns putUrl/docId/s3Key bound to the claimed profile", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.putUrl).toBe("https://minio.test/put");
    expect(body.s3Key).toMatch(/^credentials\/p1\//);
    expect(typeof body.docId).toBe("string");
  });
});
```

- [ ] **Step 2: Write the failing confirm test** (`confirm/route.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/credentials/confirm — the HeadObject-verified finish of the upload
   protocol. The real service guards run here (foreign-key prefix, id↔key
   binding, V-1 no-verifiedAt) with only the seams mocked. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { create: vi.fn() } },
  headObject: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../lib/credential-storage", () => ({
  headObject: seams.headObject,
  presignedPut: vi.fn(),
  presignedGet: vi.fn(),
  deleteObject: seams.deleteObject,
}));

import { POST } from "./route";

const DOC_ID = "doc123";
const GOOD_KEY = `credentials/p1/${DOC_ID}.pdf`;
const GOOD = { docId: DOC_ID, s3Key: GOOD_KEY, kind: "TWIC" };

function req(body: unknown) {
  return new Request("http://test/api/credentials/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
  seams.headObject.mockResolvedValue({ contentType: "application/pdf", sizeBytes: 1234 });
});

describe("POST /api/credentials/confirm", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await POST(req(GOOD))).status).toBe(401);
  });

  it("400 rejects a foreign s3Key prefix without spending a HeadObject", async () => {
    const res = await POST(req({ ...GOOD, s3Key: "credentials/OTHER/x.pdf" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/doesn't belong/);
    expect(seams.headObject).not.toHaveBeenCalled();
  });

  it("400 when the object never landed", async () => {
    seams.headObject.mockResolvedValue(null);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/didn't complete/);
  });

  it("happy path creates the row, passes optional fields, and NEVER writes verifiedAt (V-1)", async () => {
    seams.prisma.credentialDoc.create.mockResolvedValue({});
    const res = await POST(req({ ...GOOD, licenseClass: "Master 100T", expiresAt: "2027-01-15" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const data = seams.prisma.credentialDoc.create.mock.calls[0]![0].data;
    expect(data.profileId).toBe("p1");
    expect(data.licenseClass).toBe("Master 100T");
    expect(Object.keys(data)).not.toContain("verifiedAt");
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm --filter web test -- app/api/credentials/begin/route.test.ts app/api/credentials/confirm/route.test.ts`
Expected: FAIL — `./route` not found (both).

- [ ] **Step 4: Implement `begin/route.ts`**

```ts
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
```

- [ ] **Step 5: Implement `confirm/route.ts`**

```ts
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
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `pnpm --filter web test -- app/api/credentials/begin/route.test.ts app/api/credentials/confirm/route.test.ts`
Expected: 9 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/credentials/begin apps/web/app/api/credentials/confirm
git commit -m "[ai-assisted] feat: begin/confirm credential-upload routes for mobile — shared-service guards, presigned protocol (V-1, V-2) (no rules touched)"
```

---

### Task 4: `DELETE /api/credentials/[id]` + `POST /api/credentials/[id]/view` routes

**Files:**
- Create: `apps/web/app/api/credentials/[id]/route.ts`
- Create: `apps/web/app/api/credentials/[id]/view/route.ts`
- Test: `apps/web/app/api/credentials/[id]/route.test.ts`
- Test: `apps/web/app/api/credentials/[id]/view/route.test.ts`

- [ ] **Step 1: Write the failing delete test** (`[id]/route.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* DELETE /api/credentials/[id] — uploader-bound removal (V-2). Denials are
   404, never 403: existence stays hidden. Today crew can remove any own-upload
   including verified ones — policy decision pending with the client
   (docs/CLIENT-DECISIONS-2026-09-16.md); behavior changes land in the shared
   service, not here. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { findUnique: vi.fn(), delete: vi.fn() } },
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: vi.fn(),
  presignedGet: vi.fn(),
  deleteObject: seams.deleteObject,
}));

import { DELETE } from "./route";

const OWN_DOC = { id: "d1", profileId: "p1", uploadedByUserId: "u1", s3Key: "credentials/p1/d1.pdf" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test/api/credentials/d1", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("DELETE /api/credentials/[id]", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await DELETE(req(), params("d1"))).status).toBe(401);
  });

  it("404 for a doc uploaded by a previous claimant — S3 untouched (V-2)", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, uploadedByUserId: "prev" });
    expect((await DELETE(req(), params("d1"))).status).toBe(404);
    expect(seams.deleteObject).not.toHaveBeenCalled();
  });

  it("404 for a doc on a different profile", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, profileId: "other" });
    expect((await DELETE(req(), params("d1"))).status).toBe(404);
  });

  it("deletes own doc: S3 first, then the row", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(OWN_DOC);
    seams.prisma.credentialDoc.delete.mockResolvedValue({});
    const res = await DELETE(req(), params("d1"));
    expect(res.status).toBe(200);
    expect(seams.deleteObject).toHaveBeenCalledWith(OWN_DOC.s3Key);
    expect(seams.prisma.credentialDoc.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });
});
```

- [ ] **Step 2: Write the failing view test** (`[id]/view/route.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/credentials/[id]/view — owner-only short-lived presigned GET
   (V-2). POST, not GET: nothing may cache or prefetch a URL-minting endpoint.
   Denials are 404 — existence stays hidden. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  claimedProfileId: vi.fn(),
  prisma: { credentialDoc: { findUnique: vi.fn() } },
  presignedGet: vi.fn(async () => "https://minio.test/get"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../../../../lib/credential-storage", () => ({
  headObject: vi.fn(),
  presignedPut: vi.fn(),
  presignedGet: seams.presignedGet,
  deleteObject: vi.fn(),
}));

import { POST } from "./route";

const OWN_DOC = { id: "d1", profileId: "p1", uploadedByUserId: "u1", s3Key: "credentials/p1/d1.pdf" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test/api/credentials/d1/view", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue({ id: "u1", accountType: "CREW" });
  seams.claimedProfileId.mockResolvedValue("p1");
});

describe("POST /api/credentials/[id]/view", () => {
  it("401 when signed out", async () => {
    seams.sessionUser.mockResolvedValue(null);
    expect((await POST(req(), params("d1"))).status).toBe(401);
  });

  it("404 for a previous claimant's doc — no URL minted (V-2)", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, uploadedByUserId: "prev" });
    expect((await POST(req(), params("d1"))).status).toBe(404);
    expect(seams.presignedGet).not.toHaveBeenCalled();
  });

  it("happy path returns the short-lived URL", async () => {
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(OWN_DOC);
    const res = await POST(req(), params("d1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://minio.test/get" });
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter web test -- "app/api/credentials/\[id\]"`
Expected: FAIL — `./route` not found (both).

- [ ] **Step 4: Implement `[id]/route.ts`**

```ts
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
```

- [ ] **Step 5: Implement `[id]/view/route.ts`**

```ts
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
  return Response.json({ url: r.url });
}
```

- [ ] **Step 6: Run both to verify they pass, then the full web suite + build**

Run: `pnpm --filter web test && pnpm build`
Expected: all PASS (including the 7 new), build green.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/api/credentials/[id]"
git commit -m "[ai-assisted] feat: credential delete + view-url routes — uploader-bound, 404 denials, POST-minted short-lived URLs (V-2) (no rules touched)"
```

---

### Task 5: Mobile deps + pure libs (labels, validation)

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/app.json` (permission plugin)
- Create: `apps/mobile/lib/credential-labels.ts`
- Create: `apps/mobile/lib/credential-labels.test.ts`
- Create: `apps/mobile/lib/credential-upload.ts`
- Create: `apps/mobile/lib/credential-upload.test.ts`

- [ ] **Step 1: Install the three Expo packages (version-matched to SDK 57)**

```bash
cd apps/mobile && npx expo install expo-image-picker expo-document-picker expo-file-system
```

Expected: package.json gains the three deps at SDK-57-compatible versions; pnpm lockfile updates.

- [ ] **Step 2: Add the image-picker permission plugin to `apps/mobile/app.json`**

In the `expo` object, add (or extend an existing `plugins` array):

```json
"plugins": [
  [
    "expo-image-picker",
    {
      "cameraPermission": "Crew Market uses the camera to photograph your credential documents.",
      "photosPermission": "Crew Market uses your photo library to upload credential documents."
    }
  ]
]
```

(Expo Go handles prompts itself today; this matters for the upcoming EAS build.)

- [ ] **Step 3: Write the failing labels test** (`lib/credential-labels.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { CREDENTIAL_KINDS, KIND_LABELS, kindLabel, stateLabel } from "./credential-labels";

describe("credential labels", () => {
  it("every credential kind from the shared schema has a label", () => {
    for (const kind of CREDENTIAL_KINDS) {
      expect(KIND_LABELS[kind], `missing label for ${kind}`).toBeTruthy();
    }
  });

  it("unknown kinds fall back to the raw key", () => {
    expect(kindLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("state copy mirrors the web exactly — about the document, never competence (V-1/V-3)", () => {
    expect(stateLabel(true)).toBe("Verified — document reviewed");
    expect(stateLabel(false)).toBe("Self-reported — awaiting review");
  });
});
```

- [ ] **Step 4: Write the failing validation test** (`lib/credential-upload.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, isValidExpiry, validateUpload } from "./credential-upload";

describe("validateUpload (mirrors apps/web/lib/credential-rules.ts exactly)", () => {
  it("accepts pdf/jpeg/png under the cap", () => {
    expect(validateUpload("application/pdf", 1234)).toBeNull();
    expect(validateUpload("image/jpeg", 1234)).toBeNull();
    expect(validateUpload("image/png", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("rejects other types with the server's message", () => {
    expect(validateUpload("image/gif", 1234)).toBe("Upload a PDF, JPEG, or PNG.");
    expect(validateUpload(undefined, 1234)).toBe("Upload a PDF, JPEG, or PNG.");
  });

  it("rejects empty and oversize files with the server's messages", () => {
    expect(validateUpload("application/pdf", 0)).toBe("That file looks empty.");
    expect(validateUpload("application/pdf", undefined)).toBe("That file looks empty.");
    expect(validateUpload("application/pdf", MAX_UPLOAD_BYTES + 1)).toBe("Files are capped at 10 MB.");
  });
});

describe("isValidExpiry (mirrors the server's confirm check)", () => {
  it("accepts real YYYY-MM-DD dates", () => {
    expect(isValidExpiry("2027-01-15")).toBe(true);
  });
  it("rejects malformed or impossible dates", () => {
    expect(isValidExpiry("01/15/2027")).toBe(false);
    expect(isValidExpiry("2027-02-30")).toBe(false);
    expect(isValidExpiry("")).toBe(false);
  });
});
```

- [ ] **Step 5: Run both tests to verify they fail**

Run: `pnpm --filter mobile test`
Expected: FAIL — modules not found.

- [ ] **Step 6: Implement `lib/credential-labels.ts`**

```ts
// Pure credential label helpers — mobile-facing copy (no RN imports).
//
// KIND_LABELS mirrors apps/web/app/account/credentials-section.tsx EXACTLY
// (frozen vocabulary) so mobile and web read identically. If the web map
// changes, mirror it here. State copy is about the DOCUMENT, never the
// person's competence (V-1 visual distinction, V-3 wording).
import { Credential } from "@crewmarket/types";

export const CREDENTIAL_KINDS = Credential.shape.kind.options;

export const KIND_LABELS: Record<string, string> = {
  USCG_OUPV: "USCG OUPV (6-pack)",
  USCG_MASTER_25_50_100: "USCG Master",
  STCW_BASIC: "STCW Basic Training",
  CPR_FIRST_AID: "CPR / First Aid",
  TWIC: "TWIC",
  STATE_CHARTER_LICENSE: "State Charter License",
  OTHER: "Other credential",
};

/** User-facing label for a credential kind; unknown kinds fall back to the raw key. */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** Mirrors the web credentials section exactly — the brass seal is earned, never self-set (V-1). */
export function stateLabel(verified: boolean): string {
  return verified ? "Verified — document reviewed" : "Self-reported — awaiting review";
}
```

- [ ] **Step 7: Implement `lib/credential-upload.ts`**

```ts
// Pure upload validation + wire types for the credentials screen (no RN
// imports — unit-testable). validateUpload/isValidExpiry mirror
// apps/web/lib/credential-rules.ts and the confirm check EXACTLY (same
// messages) so the client rejects what the server would reject, with the
// same words. The server remains the real gate (V-2).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Null when acceptable; otherwise the server's user-facing error string. */
export function validateUpload(
  contentType: string | undefined,
  sizeBytes: number | undefined,
): string | null {
  if (!contentType || !ALLOWED_TYPES.includes(contentType)) return "Upload a PDF, JPEG, or PNG.";
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "That file looks empty.";
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) return "Files are capped at 10 MB.";
  return null;
}

/** Strict YYYY-MM-DD, real calendar date — mirrors the server's confirm check. */
export function isValidExpiry(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A file chosen from camera/library/files, normalized for the upload flow. */
export type PickedFile = { uri: string; contentType: string; sizeBytes: number };

/** Wire shape of GET /api/credentials rows. */
export type CredentialDocSummary = {
  id: string;
  kind: string;
  licenseClass: string | null;
  expiresAt: string | null; // "YYYY-MM-DD"
  uploadedAt: string; // "YYYY-MM-DD"
  verified: boolean;
};

/** Wire shape of POST /api/credentials/begin. */
export type BeginResponse = { putUrl: string; docId: string; s3Key: string };
```

- [ ] **Step 8: Run mobile tests to verify they pass**

Run: `pnpm --filter mobile test`
Expected: all PASS (new 8 + existing).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/lib/credential-labels.ts apps/mobile/lib/credential-labels.test.ts apps/mobile/lib/credential-upload.ts apps/mobile/lib/credential-upload.test.ts pnpm-lock.yaml
git commit -m "[ai-assisted] feat(mobile): credential picker deps + pure label/validation libs mirroring server rules (V-1, V-2, V-3) (no rules touched)"
```

---

### Task 6: The Credentials screen

**Files:**
- Create: `apps/mobile/src/app/credentials.tsx`

File-based routing auto-registers it; the root stack's navy header renders with a back button (same as `crew/[id]`).

- [ ] **Step 1: Create `apps/mobile/src/app/credentials.tsx`**

```tsx
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { authClient, useSession } from "../../lib/auth-client";
import { API_URL } from "../../lib/api";
import { authGuardState } from "../../lib/auth-guard";
import { CREDENTIAL_KINDS, kindLabel, stateLabel } from "../../lib/credential-labels";
import {
  isValidExpiry,
  validateUpload,
  type BeginResponse,
  type CredentialDocSummary,
  type PickedFile,
} from "../../lib/credential-upload";
import { color, font, radius, space } from "../../lib/tokens";

/* Credentials screen (slice 4). Crew-only surface for license/cert documents:
   list (verified state is admin-earned, V-1), upload via the presigned
   begin → PUT → confirm protocol (the file goes straight to storage — it never
   passes through our server process, V-2), owner-only short-lived View, and
   Remove. Copy is about documents under review, never competence (V-3, M-1).
   uploadAsync must NOT carry auth headers — the presigned URL IS the auth. */

function serverError(error: unknown): string | null {
  if (error && typeof error === "object") {
    const e = error as { error?: unknown; message?: unknown };
    if (typeof e.error === "string" && e.error) return e.error;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "denied" } // BOAT account or unclaimed crew (deep-link case)
  | { kind: "ready"; docs: CredentialDocSummary[] };

export default function CredentialsScreen() {
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = useSession();
  const gate = authGuardState({ isPending, session, error: sessionError });
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [licenseClass, setLicenseClass] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const fetchDocs = useCallback(async () => {
    const { data, error } = await authClient.$fetch<{ docs: CredentialDocSummary[] }>(
      `${API_URL}/api/credentials`,
    );
    if (error || !data) {
      const status = (error as { status?: number } | null)?.status;
      setLoad(status === 403 ? { kind: "denied" } : { kind: "error" });
      return;
    }
    setLoad({ kind: "ready", docs: data.docs });
  }, []);

  // UNKNOWN (session fetch failed — SecureStore may still hold a valid
  // session) must NOT redirect: fetch anyway and let a real 401 land in the
  // error/Retry view. Same discipline as the booking screens.
  useFocusEffect(
    useCallback(() => {
      if (gate === "CHECKING") return;
      if (gate === "SIGNED_OUT") {
        router.replace("/sign-in");
        return;
      }
      void fetchDocs();
    }, [gate, router, fetchDocs]),
  );

  const viewDoc = useCallback(async (id: string) => {
    setListError(null);
    const { data, error } = await authClient.$fetch<{ url: string }>(
      `${API_URL}/api/credentials/${id}/view`,
      { method: "POST", body: {} },
    );
    if (error || !data?.url) {
      setListError(serverError(error) ?? "Couldn't open that document — try again.");
      return;
    }
    // The URL expires in 60s — open immediately, never store it.
    await WebBrowser.openBrowserAsync(data.url);
  }, []);

  const removeDoc = useCallback(
    (id: string) => {
      Alert.alert("Remove this document?", "This deletes the file and its record.", [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setListError(null);
              const { error } = await authClient.$fetch(`${API_URL}/api/credentials/${id}`, {
                method: "DELETE",
              });
              if (error) setListError(serverError(error) ?? "Couldn't remove that — try again.");
              await fetchDocs();
            })();
          },
        },
      ]);
    },
    [fetchDocs],
  );

  const startUpload = useCallback(
    async (file: PickedFile) => {
      if (busy) return;
      if (!kind) {
        setFormError("Choose a credential type from the list.");
        return;
      }
      const invalid = validateUpload(file.contentType, file.sizeBytes);
      if (invalid) {
        setFormError(invalid);
        return;
      }
      if (expiresAt.trim() && !isValidExpiry(expiresAt.trim())) {
        setFormError("Enter a valid expiry date (YYYY-MM-DD).");
        return;
      }
      setBusy(true);
      setFormError(null);
      try {
        const { data: begin, error: beginErr } = await authClient.$fetch<BeginResponse>(
          `${API_URL}/api/credentials/begin`,
          {
            method: "POST",
            body: { kind, contentType: file.contentType, sizeBytes: file.sizeBytes },
          },
        );
        if (beginErr || !begin) {
          setFormError(serverError(beginErr) ?? "Couldn't start the upload — try again.");
          return;
        }
        // Straight to storage via the presigned URL (V-2) — no auth headers here.
        const put = await FileSystem.uploadAsync(begin.putUrl, file.uri, {
          httpMethod: "PUT",
          headers: { "Content-Type": file.contentType },
        });
        if (put.status < 200 || put.status >= 300) {
          setFormError("Upload didn't complete — check your connection and try again.");
          return;
        }
        const { error: confirmErr } = await authClient.$fetch(
          `${API_URL}/api/credentials/confirm`,
          {
            method: "POST",
            body: {
              docId: begin.docId,
              s3Key: begin.s3Key,
              kind,
              licenseClass: licenseClass.trim() || undefined,
              expiresAt: expiresAt.trim() || undefined,
            },
          },
        );
        if (confirmErr) {
          setFormError(serverError(confirmErr) ?? "Couldn't save the document — try again.");
          return;
        }
        setKind(null);
        setLicenseClass("");
        setExpiresAt("");
        await fetchDocs();
      } catch {
        setFormError("Something went wrong — try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, kind, licenseClass, expiresAt, fetchDocs],
  );

  // Pickers normalize to PickedFile. fileSize/mimeType can be missing on some
  // platforms — fall back to getInfoAsync / jpeg, then validate.
  async function resolveSize(uri: string, fromAsset: number | undefined): Promise<number> {
    if (typeof fromAsset === "number" && fromAsset > 0) return fromAsset;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : 0;
  }

  const pickCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setFormError("Camera access is off — enable it in Settings to photograph a document.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await startUpload({
      uri: a.uri,
      contentType: a.mimeType ?? "image/jpeg",
      sizeBytes: await resolveSize(a.uri, a.fileSize),
    });
  }, [startUpload]);

  const pickLibrary = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await startUpload({
      uri: a.uri,
      contentType: a.mimeType ?? "image/jpeg",
      sizeBytes: await resolveSize(a.uri, a.fileSize),
    });
  }, [startUpload]);

  const pickFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await startUpload({
      uri: a.uri,
      contentType: a.mimeType ?? "application/pdf",
      sizeBytes: await resolveSize(a.uri, a.size),
    });
  }, [startUpload]);

  if (gate === "CHECKING" || gate === "SIGNED_OUT" || load.kind === "loading") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Credentials" }} />
        <ActivityIndicator color={color.navyDeep} />
      </View>
    );
  }
  if (load.kind === "denied") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Credentials" }} />
        <Text style={styles.centerText}>
          Credentials live on crew accounts with a claimed board profile.
        </Text>
      </View>
    );
  }
  if (load.kind === "error") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Credentials" }} />
        <Text style={styles.centerText}>Couldn&apos;t load your documents.</Text>
        <Pressable style={styles.retry} onPress={() => void fetchDocs()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Credentials" }} />
      <View style={styles.head}>
        <Text style={styles.eyebrow}>DOCUMENTS</Text>
        <Text style={styles.lede}>
          Upload license and certification documents for admin review. Documents stay private;
          your public listing shows only the credential details.
        </Text>
      </View>

      {listError ? <Text style={styles.error}>{listError}</Text> : null}

      {load.docs.length === 0 ? (
        <View style={styles.panel}>
          <Text style={styles.muted}>No documents uploaded yet.</Text>
        </View>
      ) : (
        load.docs.map((d) => (
          <View key={d.id} style={styles.panel}>
            <Text style={styles.docKind}>{kindLabel(d.kind)}</Text>
            {d.licenseClass ? <Text style={styles.docLine}>{d.licenseClass}</Text> : null}
            {d.expiresAt ? <Text style={styles.docMeta}>expires {d.expiresAt}</Text> : null}
            <Text style={styles.docMeta}>uploaded {d.uploadedAt}</Text>
            <Text style={d.verified ? styles.stateVerified : styles.stateSelf}>
              {stateLabel(d.verified)}
            </Text>
            <View style={styles.rowActions}>
              <Pressable
                style={styles.btnGhostSmall}
                onPress={() => void viewDoc(d.id)}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>View</Text>
              </Pressable>
              <Pressable
                style={styles.btnGhostSmall}
                onPress={() => removeDoc(d.id)}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <View style={styles.panel}>
        <Text style={styles.panelEyebrow}>ADD A DOCUMENT</Text>
        <Text style={styles.muted}>PDF, JPEG, or PNG — up to 10 MB.</Text>

        <Text style={styles.fieldLabel}>Credential type</Text>
        <View style={styles.kinds}>
          {CREDENTIAL_KINDS.map((k) => (
            <Pressable
              key={k}
              style={[styles.kindChip, kind === k && styles.kindChipOn]}
              onPress={() => setKind(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.kindChipText, kind === k && styles.kindChipTextOn]}>
                {kindLabel(k)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>License class (optional)</Text>
        <TextInput
          style={styles.input}
          value={licenseClass}
          onChangeText={setLicenseClass}
          placeholder="e.g. Master 100T"
          placeholderTextColor={color.inkSoft}
          maxLength={80}
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Expires (optional)</Text>
        <TextInput
          style={styles.input}
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={color.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <View style={styles.sources}>
          <Pressable
            style={[styles.btnBrass, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void pickCamera()}
            accessibilityRole="button"
          >
            <Text style={styles.btnBrassText}>{busy ? "Uploading…" : "Take photo"}</Text>
          </Pressable>
          <Pressable
            style={[styles.btnGhost, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void pickLibrary()}
            accessibilityRole="button"
          >
            <Text style={styles.btnGhostText}>Photo library</Text>
          </Pressable>
          <Pressable
            style={[styles.btnGhost, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void pickFile()}
            accessibilityRole="button"
          >
            <Text style={styles.btnGhostText}>Choose file</Text>
          </Pressable>
        </View>
        <Text style={styles.finePrint}>
          Verification means an admin reviewed the document — it&apos;s never self-set.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.boardBg },
  content: { paddingBottom: space.s7 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s4,
    padding: space.s5,
    backgroundColor: color.boardBg,
  },
  centerText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center" },
  retry: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
  head: {
    backgroundColor: color.navyDeep,
    padding: space.s5,
    gap: space.s2,
    borderBottomWidth: 1,
    borderBottomColor: color.brassEngrave,
  },
  eyebrow: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    color: color.navyMuted,
    textTransform: "uppercase",
  },
  lede: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.navyMuted },
  panel: {
    backgroundColor: color.whiteCrisp,
    marginTop: space.s3,
    marginHorizontal: space.s3,
    padding: space.s5,
    gap: space.s2,
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
  },
  panelEyebrow: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: color.inkSoft,
    textTransform: "uppercase",
  },
  muted: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  docKind: { fontFamily: font.display, fontSize: 18, color: color.ink, letterSpacing: 0.3 },
  docLine: { fontFamily: font.body, fontSize: 14, color: color.ink },
  docMeta: { fontFamily: font.mono, fontSize: 11, color: color.inkSoft },
  stateVerified: { fontFamily: font.body, fontSize: 13, fontWeight: "600", color: color.brassText },
  stateSelf: { fontFamily: font.body, fontSize: 13, color: color.inkSoft },
  rowActions: { flexDirection: "row", gap: space.s3, marginTop: space.s2 },
  btnGhostSmall: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    minHeight: 40,
    paddingHorizontal: space.s4,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: color.inkSoft,
    textTransform: "uppercase",
    marginTop: space.s3,
  },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  kindChip: {
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    minHeight: 40,
    justifyContent: "center",
  },
  kindChipOn: { borderColor: color.brass, backgroundColor: color.boardBg },
  kindChipText: { fontFamily: font.body, fontSize: 13, color: color.ink },
  kindChipTextOn: { color: color.brassText, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: color.lineOnWhite,
    borderRadius: radius,
    minHeight: 44,
    paddingHorizontal: space.s3,
    fontFamily: font.body,
    fontSize: 15,
    color: color.ink,
  },
  error: { fontFamily: font.body, fontSize: 13, color: color.brassText, paddingHorizontal: space.s5, paddingTop: space.s2 },
  sources: { gap: space.s3, marginTop: space.s3 },
  btnBrass: {
    backgroundColor: color.brassText,
    borderRadius: radius,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnBrassText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: "#ffffff" },
  btnGhost: {
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: color.brassText },
  btnDisabled: { opacity: 0.5 },
  finePrint: { fontFamily: font.body, fontSize: 12, color: color.inkSoft, marginTop: space.s2 },
});
```

Style-token note: if `color.lineOnWhite` doesn't exist in `lib/tokens.ts`, use the closest existing hairline token the account screen's panel uses (check `account.tsx` — it uses `color.lineOnWhite`; if that resolves, keep it).

- [ ] **Step 2: Typecheck + lint + tests**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test`
Expected: all clean/green. Fix any RN/expo API mismatches the typecheck surfaces (picker asset fields differ slightly across SDK minors — the typechecker is authoritative, not this plan).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/credentials.tsx
git commit -m "[ai-assisted] feat(mobile): credentials screen — list/view/remove + camera/library/file upload via presigned begin→PUT→confirm (V-1, V-2, V-3) (no rules touched)"
```

---

### Task 7: Account tab entry row

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/account.tsx`

- [ ] **Step 1: Add the Credentials row to the crew panel**

In the crew panel JSX, directly after the `claim.kind === "claimed"` block's profile name (inside the same fragment), add:

```tsx
          {claim.kind === "claimed" && (
            <>
              <Text style={styles.list}>You drive this profile:</Text>
              <Text style={styles.profileName}>{claim.displayName}</Text>
              <Pressable
                style={styles.credRow}
                onPress={() => router.push("/credentials")}
                accessibilityRole="button"
              >
                <Text style={styles.credRowText}>Credentials</Text>
                <Text style={styles.credRowChevron}>›</Text>
              </Pressable>
            </>
          )}
```

And add to the `StyleSheet.create` map:

```ts
  credRow: {
    marginTop: space.s3,
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.brass,
    borderRadius: radius,
    paddingHorizontal: space.s4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  credRowText: { fontFamily: font.display, fontSize: 15, letterSpacing: 0.4, color: color.brassText },
  credRowChevron: { fontFamily: font.body, fontSize: 20, color: color.brassText },
```

- [ ] **Step 2: Typecheck + lint + tests**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/(tabs)/account.tsx"
git commit -m "[ai-assisted] feat(mobile): Credentials entry row on the Account tab (claimed crew only) (no rules touched)"
```

---

### Task 8: Full gates + HANDOFF

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Run every gate from the repo root**

```bash
pnpm build && pnpm lint && pnpm compliance:check
pnpm --filter web test && pnpm --filter mobile test
```

Expected: all green. `pnpm build` is the narrowing gate (strict:false); `compliance:check` is the M-1 gate and now also scans the new mobile copy.

- [ ] **Step 2: Add the slice-4 status line to `HANDOFF.md`**

Append to the "Current state" section:

```markdown
- **Mobile slice 4 SHIPPED (9/19/2026):** crew credential upload native — Credentials screen
  (Account tab → claimed crew), camera/library/file sources, presigned begin→PUT→confirm reused
  via new `/api/credentials*` routes wrapping the extracted `apps/web/lib/credential-service.ts`
  (one home for V-1/V-2 guards; web actions now thin wrappers). Device testing needs
  `S3_ENDPOINT` at the Mac's LAN IP (presigned URLs embed the signing host — localhost MinIO is
  unreachable from the phone); Vercel can't host this until the real AWS bucket lands.
```

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md
git commit -m "[ai-assisted] docs: HANDOFF — mobile slice 4 shipped (crew credential upload native) (no rules touched)"
```

---

### Task 9: Device pass (manual — the user runs this; do NOT fabricate results)

Agent's only step here is to present this checklist and stop. A subagent must never claim these passed.

**Setup (Mac):**
1. `colima start` + `docker compose up -d` (Postgres + MinIO as usual).
2. Find the LAN IP: `ipconfig getifaddr en0`.
3. In `apps/web/.env.local`: set `S3_ENDPOINT=http://<LAN-IP>:9000` (was localhost). Leave everything else.
4. Start web: `PORT=3002 pnpm --filter web dev`.
5. Start mobile: in `apps/mobile`, `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3002 npx expo start`, open in Expo Go on the phone.

**Checklist (crew account with a claimed profile):**
- [ ] Account tab shows the Credentials row; tapping opens the screen.
- [ ] Empty state reads "No documents uploaded yet."
- [ ] Take photo → uploads → appears as "Self-reported — awaiting review".
- [ ] Photo library upload works.
- [ ] Choose file with a PDF works.
- [ ] A >10 MB file is rejected with "Files are capped at 10 MB." before any network call.
- [ ] View opens the document in the in-app browser.
- [ ] Remove (after the confirm alert) deletes and the list refreshes.
- [ ] Web `/account` shows the same list (upload from phone, verify on web).
- [ ] Admin verify on web → phone list shows "Verified — document reviewed" after refocus.
- [ ] BOAT account deep-linking to `/credentials` sees the denied message, not the form.
- [ ] Opportunistic re-check: boot-to-sign-in fix `6188fcd` still holds after backgrounding.

**Reset afterwards:** restore `S3_ENDPOINT=http://localhost:9000` if you prefer localhost for web-only dev (web-browser uploads work either way while on the same LAN).
