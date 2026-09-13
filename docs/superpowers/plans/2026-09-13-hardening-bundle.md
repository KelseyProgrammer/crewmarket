# Hardening Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three recorded debt items: rate-limit + TTL-cache the public `/api/board`, unit-test the credential server-action guards (spec §7 gap), and stand up a mobile vitest runner for the pure board logic.

**Architecture:** Two tiny pure modules (`rate-limit.ts`, `ttl-cache.ts`) compose into a thin `/api/board` route; guard tests mock the four seams (prisma, session, storage, next) around the real action code; mobile gets vitest scoped to `lib/` only. Root gains `turbo test` wiring.

**Tech Stack:** Next.js 15 route handlers, vitest ^3.2.7 (both apps), vi.mock/vi.hoisted/vi.stubGlobal/vi.stubEnv, turborepo.

**Spec:** `docs/superpowers/specs/2026-09-13-hardening-bundle-design.md`
**Compliance:** every commit `[ai-assisted]` + rule IDs; run `pnpm compliance:check` after the 429 copy lands. The board stays public by design (V-2/D-3/P-4) — do NOT add auth.

---

### Task 1: Rate-limit module (web)

**Files:**
- Create: `apps/web/lib/rate-limit.ts`
- Test: `apps/web/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/rate-limit.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimiter } from "./rate-limit";

const OPTS = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimiter());

  it("allows up to `limit` requests inside one window", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("a", { ...OPTS, now: t0 }).allowed).toBe(true);
    expect(checkRateLimit("a", { ...OPTS, now: t0 + 1 }).allowed).toBe(true);
    expect(checkRateLimit("a", { ...OPTS, now: t0 + 2 }).allowed).toBe(true);
  });

  it("rejects the request after the limit with a ceil'd Retry-After", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("a", { ...OPTS, now: t0 + i });
    const r = checkRateLimit("a", { ...OPTS, now: t0 + 10_500 });
    expect(r.allowed).toBe(false);
    // window ends at t0+60_000 → 49_500ms left → ceil to 50s
    expect(r.retryAfterSec).toBe(50);
  });

  it("keys are isolated from each other", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) checkRateLimit("a", { ...OPTS, now: t0 });
    expect(checkRateLimit("b", { ...OPTS, now: t0 }).allowed).toBe(true);
  });

  it("a fresh window resets the count", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) checkRateLimit("a", { ...OPTS, now: t0 });
    expect(checkRateLimit("a", { ...OPTS, now: t0 + 60_000 }).allowed).toBe(true);
  });

  it("prunes stale windows so the map does not grow unbounded", () => {
    const t0 = 1_000_000;
    checkRateLimit("stale", { ...OPTS, now: t0 });
    checkRateLimit("fresh", { ...OPTS, now: t0 + 120_000 });
    expect(windowCount()).toBe(1); // only "fresh" survives
  });
});

import { windowCount } from "./rate-limit";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run lib/rate-limit.test.ts`
Expected: FAIL — cannot resolve `./rate-limit`

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/rate-limit.ts
/* Fixed-window per-key rate limiter for the public board feed.
   In-memory and per-instance ON PURPOSE: demo-scale posture (HANDOFF debt
   item — "note before real traffic"). Counts reset on deploy/restart; a
   multi-instance deployment needs a shared store before this means anything.
   Pure + clock-injectable so vitest drives it without timers. */

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

type Window = { startMs: number; count: number };

const windows = new Map<string, Window>();

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  const now = opts.now ?? Date.now();
  prune(now, opts.windowMs);
  const w = windows.get(key);
  if (!w || now - w.startMs >= opts.windowMs) {
    windows.set(key, { startMs: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  w.count += 1;
  if (w.count > opts.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((w.startMs + opts.windowMs - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function prune(now: number, windowMs: number) {
  for (const [key, w] of windows) {
    if (now - w.startMs >= windowMs) windows.delete(key);
  }
}

/** Test hooks — not used by the route. */
export function resetRateLimiter(): void {
  windows.clear();
}
export function windowCount(): number {
  return windows.size;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run lib/rate-limit.test.ts` — Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rate-limit.ts apps/web/lib/rate-limit.test.ts
git commit -m "[ai-assisted] rate-limit module: fixed-window per-key, clock-injectable (board hardening; no rules touched)"
```
(append the standard Co-Authored-By/Claude-Session trailer to every commit in this plan)

---

### Task 2: TTL cache module (web)

**Files:**
- Create: `apps/web/lib/ttl-cache.ts`
- Test: `apps/web/lib/ttl-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/ttl-cache.test.ts
import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  it("loads once inside the TTL", async () => {
    const load = vi.fn(async () => "v1");
    const cache = createTtlCache(load, 30_000);
    expect(await cache.get(1_000)).toBe("v1");
    expect(await cache.get(20_000)).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after expiry", async () => {
    let n = 0;
    const load = vi.fn(async () => `v${++n}`);
    const cache = createTtlCache(load, 30_000);
    expect(await cache.get(1_000)).toBe("v1");
    expect(await cache.get(31_001)).toBe("v2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("concurrent misses share one in-flight load", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const cache = createTtlCache(load, 30_000);
    const [a, b] = [cache.get(1_000), cache.get(1_000)];
    resolve("v1");
    expect(await a).toBe("v1");
    expect(await b).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a failed load is not cached — the next get retries", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("v1");
    const cache = createTtlCache(load, 30_000);
    await expect(cache.get(1_000)).rejects.toThrow("db down");
    expect(await cache.get(1_001)).toBe("v1");
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `cd apps/web && npx vitest run lib/ttl-cache.test.ts` (cannot resolve `./ttl-cache`)

- [ ] **Step 3: Implementation**

```ts
// apps/web/lib/ttl-cache.ts
/* One-entry async TTL memo. Used by /api/board so request bursts serve a
   ≤30s-old payload instead of hitting postgres per request. Clock-injectable
   for tests; per-instance like the rate limiter (same demo-scale posture). */

export function createTtlCache<T>(load: () => Promise<T>, ttlMs: number) {
  let entry: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;
  return {
    async get(now: number = Date.now()): Promise<T> {
      if (entry && now - entry.at < ttlMs) return entry.data;
      if (inflight) return inflight;
      inflight = load()
        .then((data) => {
          entry = { at: now, data };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
  };
}
```

- [ ] **Step 4: Run to verify PASS** — 4 passed
- [ ] **Step 5: Commit** — `[ai-assisted] ttl-cache module: one-entry async memo for board payload (no rules touched)`

---

### Task 3: Wire `/api/board`

**Files:**
- Modify: `apps/web/app/api/board/route.ts` (whole file below)

- [ ] **Step 1: Replace the route**

```ts
// apps/web/app/api/board/route.ts
import { boardData } from "../../../lib/board-data";
import { checkRateLimit } from "../../../lib/rate-limit";
import { createTtlCache } from "../../../lib/ttl-cache";

/* Public read-only board feed for the mobile app (Expo slice 1). Exactly the
   data the public directory renders — no auth BY DESIGN, nothing private
   (V-2, D-3); the marketplace directory is open (P-4). Response shape is
   hand-typed in apps/mobile/lib/board.ts — keep in lockstep.

   Hardening (2026-09-13 bundle): per-IP fixed-window rate limit + a 30s
   in-process TTL cache so bursts never reach postgres. Both are in-memory
   and per-instance — honest at single-instance demo scale; needs a shared
   store before real multi-instance traffic. The 30s staleness is invisible
   next to the mobile client's session-long cache. */

export const dynamic = "force-dynamic";

const LIMIT = 60; // requests per key
const WINDOW_MS = 60_000;
const BOARD_TTL_MS = 30_000;

const boardCache = createTtlCache(async () => ({ profiles: await boardData() }), BOARD_TTL_MS);

function callerKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(req: Request) {
  const { allowed, retryAfterSec } = checkRateLimit(callerKey(req), {
    limit: LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!allowed) {
    return Response.json(
      { error: "The board is busy right now — try again in a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  return Response.json(await boardCache.get(), {
    headers: { "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 2: Gates** — `cd apps/web && npx tsc --noEmit && npx vitest run && npx eslint app/api lib` then `pnpm compliance:check` at root (new 429 copy). Expected: all green.
- [ ] **Step 3: Commit** — `[ai-assisted] /api/board hardening: per-IP rate limit + 30s TTL cache, stays public by design (V-2, D-3, P-4; no rules touched)`

---

### Task 4: Crew credential-action guard tests

**Files:**
- Test: `apps/web/app/account/credential-actions.test.ts` (code under test already exists — tests should PASS; a failure is a real finding, stop and report)

- [ ] **Step 1: Write the test file**

```ts
// apps/web/app/account/credential-actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec §7 guard matrix (2026-09-04 credential spec): these tests pin the
   actions' guard behavior with the four seams mocked — prisma, session/claim,
   storage, next. The pure helpers (credential-rules) run for real. */

const seams = vi.hoisted(() => {
  class RedirectSentinel extends Error {
    constructor(public target: string) {
      super(`REDIRECT:${target}`);
    }
  }
  return {
    RedirectSentinel,
    sessionUser: vi.fn(),
    claimedProfileId: vi.fn(),
    prisma: {
      credentialDoc: {
        create: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    },
    headObject: vi.fn(),
    presignedPut: vi.fn(async () => "https://minio.test/put"),
    presignedGet: vi.fn(async () => "https://minio.test/get"),
    deleteObject: vi.fn(async () => undefined),
    redirect: vi.fn((target: string) => {
      throw new RedirectSentinel(target);
    }),
  };
});

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  claimedProfileId: seams.claimedProfileId,
}));
vi.mock("../../lib/credential-storage", () => ({
  headObject: seams.headObject,
  presignedPut: seams.presignedPut,
  presignedGet: seams.presignedGet,
  deleteObject: seams.deleteObject,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import {
  beginCredentialUpload,
  confirmCredentialUpload,
  deleteCredentialDoc,
  viewOwnCredentialDoc,
} from "./credential-actions";

const CREW = { id: "u1", accountType: "CREW", email: "crew@example.test" };
const BOAT = { id: "u2", accountType: "BOAT", email: "boat@example.test" };
const DOC_ID = "doc123";
const GOOD_KEY = `credentials/p1/${DOC_ID}.pdf`;
const GOOD_HEAD = { contentType: "application/pdf", sizeBytes: 1234 };

function signedInCrewWithClaim() {
  seams.sessionUser.mockResolvedValue(CREW);
  seams.claimedProfileId.mockResolvedValue("p1");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("beginCredentialUpload", () => {
  const INPUT = { kind: "TWIC", contentType: "application/pdf", sizeBytes: 1234 };

  it("redirects to sign-in without a session", async () => {
    seams.sessionUser.mockResolvedValue(null);
    await expect(beginCredentialUpload(INPUT)).rejects.toThrow("REDIRECT:/sign-in?from=/account");
  });

  it("rejects BOAT accounts", async () => {
    seams.sessionUser.mockResolvedValue(BOAT);
    expect(await beginCredentialUpload(INPUT)).toEqual({
      error: "Only crew accounts upload credentials.",
    });
  });

  it("rejects a crew session without a claimed profile", async () => {
    seams.sessionUser.mockResolvedValue(CREW);
    seams.claimedProfileId.mockResolvedValue(null);
    const r = await beginCredentialUpload(INPUT);
    expect("error" in r && r.error).toMatch(/isn't linked/);
  });

  it("rejects a kind outside the allowlist", async () => {
    signedInCrewWithClaim();
    const r = await beginCredentialUpload({ ...INPUT, kind: "FAKE_KIND" });
    expect("error" in r && r.error).toMatch(/credential type/);
  });

  it("rejects invalid uploads before presigning", async () => {
    signedInCrewWithClaim();
    const r = await beginCredentialUpload({ ...INPUT, contentType: "image/gif" });
    expect("error" in r).toBe(true);
    expect(seams.presignedPut).not.toHaveBeenCalled();
  });

  it("happy path returns a put URL bound to the claimed profile", async () => {
    signedInCrewWithClaim();
    const r = await beginCredentialUpload(INPUT);
    if ("error" in r) throw new Error(r.error);
    expect(r.putUrl).toBe("https://minio.test/put");
    expect(r.s3Key).toMatch(/^credentials\/p1\//);
  });
});

describe("confirmCredentialUpload", () => {
  const INPUT = { docId: DOC_ID, s3Key: GOOD_KEY, kind: "TWIC" };

  it("rejects a foreign s3Key prefix without spending a HeadObject", async () => {
    signedInCrewWithClaim();
    const r = await confirmCredentialUpload({ ...INPUT, s3Key: "credentials/OTHER/x.pdf" });
    expect(r.error).toMatch(/doesn't belong/);
    expect(seams.headObject).not.toHaveBeenCalled();
  });

  it("rejects a tampered id↔key pairing", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue(GOOD_HEAD);
    const r = await confirmCredentialUpload({ ...INPUT, docId: "differentid" });
    expect(r.error).toMatch(/doesn't match/);
    expect(seams.prisma.credentialDoc.create).not.toHaveBeenCalled();
  });

  it("errors when the object never landed", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue(null);
    const r = await confirmCredentialUpload(INPUT);
    expect(r.error).toMatch(/didn't complete/);
  });

  it("deletes a rejected object instead of keeping it", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue({ contentType: "image/gif", sizeBytes: 10 });
    const r = await confirmCredentialUpload(INPUT);
    expect(r.error).toBeTruthy();
    expect(seams.deleteObject).toHaveBeenCalledWith(GOOD_KEY);
    expect(seams.prisma.credentialDoc.create).not.toHaveBeenCalled();
  });

  it("happy path creates the row and NEVER writes verifiedAt (V-1)", async () => {
    signedInCrewWithClaim();
    seams.headObject.mockResolvedValue(GOOD_HEAD);
    seams.prisma.credentialDoc.create.mockResolvedValue({});
    const r = await confirmCredentialUpload(INPUT);
    expect(r).toEqual({});
    expect(seams.prisma.credentialDoc.create).toHaveBeenCalledTimes(1);
    const data = seams.prisma.credentialDoc.create.mock.calls[0][0].data;
    expect(data.profileId).toBe("p1");
    expect(Object.keys(data)).not.toContain("verifiedAt");
    expect(Object.keys(data)).not.toContain("verifiedByEmail");
  });
});

describe("deleteCredentialDoc / viewOwnCredentialDoc — uploader-bound (V-2)", () => {
  function form(docId: string) {
    const f = new FormData();
    f.set("docId", docId);
    return f;
  }
  const OWN_DOC = { id: DOC_ID, profileId: "p1", uploadedByUserId: "u1", s3Key: GOOD_KEY };

  it("denies a doc on the right profile uploaded by a previous claimant", async () => {
    signedInCrewWithClaim();
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({
      ...OWN_DOC,
      uploadedByUserId: "previous-user",
    });
    await expect(deleteCredentialDoc(form(DOC_ID))).rejects.toThrow(
      "REDIRECT:/account?cred=denied",
    );
    expect(seams.deleteObject).not.toHaveBeenCalled();
    await expect(viewOwnCredentialDoc(form(DOC_ID))).rejects.toThrow(
      "REDIRECT:/account?cred=denied",
    );
    expect(seams.presignedGet).not.toHaveBeenCalled();
  });

  it("denies a doc on a different profile", async () => {
    signedInCrewWithClaim();
    seams.prisma.credentialDoc.findUnique.mockResolvedValue({ ...OWN_DOC, profileId: "other" });
    await expect(deleteCredentialDoc(form(DOC_ID))).rejects.toThrow(
      "REDIRECT:/account?cred=denied",
    );
    expect(seams.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes own doc: S3 first, then the row", async () => {
    signedInCrewWithClaim();
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(OWN_DOC);
    seams.prisma.credentialDoc.delete.mockResolvedValue({});
    await deleteCredentialDoc(form(DOC_ID));
    expect(seams.deleteObject).toHaveBeenCalledWith(GOOD_KEY);
    expect(seams.prisma.credentialDoc.delete).toHaveBeenCalledWith({ where: { id: DOC_ID } });
  });
});
```

- [ ] **Step 2: Run** — `cd apps/web && npx vitest run app/account/credential-actions.test.ts`. Expected: all pass. Any failure = report the guard gap, do not "fix" the test to match broken behavior.
- [ ] **Step 3: Commit** — `[ai-assisted] guard tests: crew credential actions — session/claim/kind gates, key binding, uploader-bound delete/view, no crew path writes verifiedAt (V-1, V-2; no rules touched)`

---

### Task 5: Admin credential-action guard tests

**Files:**
- Test: `apps/web/app/admin/credentials/actions.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// apps/web/app/admin/credentials/actions.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  prisma: { credentialDoc: { findUnique: vi.fn(), update: vi.fn() } },
  presignedGet: vi.fn(async () => "https://minio.test/get"),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../lib/bookings", () => ({ sessionUser: seams.sessionUser }));
vi.mock("../../../lib/credential-storage", () => ({ presignedGet: seams.presignedGet }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import { setCredentialVerified, viewCredentialDocAsAdmin } from "./actions";

const ADMIN = { id: "a1", email: "admin@crewmarket.test", accountType: "BOAT" };
const CREW = { id: "u1", email: "crew@example.test", accountType: "CREW" };
const DOC = { id: "doc123", profileId: "p1", s3Key: "credentials/p1/doc123.pdf" };

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_EMAILS", "admin@crewmarket.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("setCredentialVerified (V-1: the only verifiedAt writer)", () => {
  it("does nothing for a signed-in non-admin", async () => {
    seams.sessionUser.mockResolvedValue(CREW);
    await setCredentialVerified(form({ docId: DOC.id, verify: "1" }));
    expect(seams.prisma.credentialDoc.update).not.toHaveBeenCalled();
  });

  it("does nothing without a session", async () => {
    seams.sessionUser.mockResolvedValue(null);
    await setCredentialVerified(form({ docId: DOC.id, verify: "1" }));
    expect(seams.prisma.credentialDoc.update).not.toHaveBeenCalled();
  });

  it("admin verify stamps verifiedAt + verifiedByEmail", async () => {
    seams.sessionUser.mockResolvedValue(ADMIN);
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(DOC);
    seams.prisma.credentialDoc.update.mockResolvedValue({});
    await setCredentialVerified(form({ docId: DOC.id, verify: "1" }));
    const arg = seams.prisma.credentialDoc.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: DOC.id });
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
    expect(arg.data.verifiedByEmail).toBe(ADMIN.email);
  });

  it("admin unverify nulls both fields", async () => {
    seams.sessionUser.mockResolvedValue(ADMIN);
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(DOC);
    seams.prisma.credentialDoc.update.mockResolvedValue({});
    await setCredentialVerified(form({ docId: DOC.id }));
    expect(seams.prisma.credentialDoc.update.mock.calls[0][0].data).toEqual({
      verifiedAt: null,
      verifiedByEmail: null,
    });
  });
});

describe("viewCredentialDocAsAdmin", () => {
  it("never presigns for a non-admin", async () => {
    seams.sessionUser.mockResolvedValue(CREW);
    await viewCredentialDocAsAdmin(form({ docId: DOC.id }));
    expect(seams.presignedGet).not.toHaveBeenCalled();
  });

  it("redirects an admin to a short-lived URL", async () => {
    seams.sessionUser.mockResolvedValue(ADMIN);
    seams.prisma.credentialDoc.findUnique.mockResolvedValue(DOC);
    await expect(viewCredentialDocAsAdmin(form({ docId: DOC.id }))).rejects.toThrow(
      "REDIRECT:https://minio.test/get",
    );
  });
});
```

- [ ] **Step 2: Run** — `cd apps/web && npx vitest run app/admin/credentials/actions.test.ts`. Expected: all pass (same rule: a failure is a finding).
- [ ] **Step 3: Commit** — `[ai-assisted] guard tests: admin verify allowlist — only admin path writes verifiedAt, non-admin never presigns (V-1, V-2; no rules touched)`

---

### Task 6: Mobile vitest runner + root test wiring

**Files:**
- Modify: `apps/mobile/package.json` (add devDep + script)
- Create: `apps/mobile/vitest.config.ts`
- Modify: root `package.json` (add `"test": "turbo test"` script)
- Modify: `turbo.json` (add `"test": {}` task)

- [ ] **Step 1: Add vitest to mobile** — `cd apps/mobile && pnpm add -D vitest@^3.2.7`
- [ ] **Step 2: Config + script**

```ts
// apps/mobile/vitest.config.ts
import { defineConfig } from "vitest/config";

// Pure-logic tests only (lib/): no RN runtime, no jest-expo. Component
// behavior stays on the device-verification path (HANDOFF).
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
```

In `apps/mobile/package.json` scripts add: `"test": "vitest run"`.

- [ ] **Step 3: Root wiring** — root `package.json` scripts add `"test": "turbo test"`; `turbo.json` tasks add `"test": {}`.
- [ ] **Step 4: Verify wiring** — at root: `pnpm test`. Expected: web's 25+new tests run and pass; mobile reports "no test files found" (exit 0 comes in Task 7 — if vitest exits 1 on empty, add `--passWithNoTests` to the mobile script and remove it in Task 7).
- [ ] **Step 5: Commit** — `[ai-assisted] mobile vitest runner (lib-scoped, node env) + turbo test pipeline (no rules touched)`

---

### Task 7: Mobile board logic tests

**Files:**
- Test: `apps/mobile/lib/board.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// apps/mobile/lib/board.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardWindowStart, filterBoard, EMPTY_FILTERS, type BoardProfile } from "./board";

/* Lockstep guard: these semantics mirror apps/web/app/directory/page.tsx's
   inline filter. M-2: a date absent from availability is closed, never open. */

function profile(over: Partial<BoardProfile>): BoardProfile {
  return {
    id: "x",
    displayName: "X",
    roles: ["MATE"],
    homePort: "Miami, FL",
    regions: [],
    yearsExperience: 1,
    fisheries: [],
    vesselExperience: [],
    dayRateUsd: 100,
    bio: "",
    credentials: [],
    availability: [],
    stats: { tripsCompleted: 0 },
    ...over,
  };
}

const CAPTAIN = profile({
  id: "c",
  roles: ["CAPTAIN"],
  homePort: "Key West, FL",
  credentials: [{ kind: "USCG_OUPV", verified: true }],
  availability: [{ date: "2026-08-28", status: "OPEN" }],
});
const MATE = profile({
  id: "m",
  roles: ["MATE"],
  homePort: "Miami, FL",
  credentials: [{ kind: "TWIC", verified: false }],
  availability: [{ date: "2026-08-29", status: "BOOKED" }],
});
const BOARD = [CAPTAIN, MATE];

describe("filterBoard", () => {
  it("empty filters return the whole board", () => {
    expect(filterBoard(BOARD, EMPTY_FILTERS)).toEqual(BOARD);
  });
  it("role filter", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, role: "CAPTAIN" })).toEqual([CAPTAIN]);
  });
  it("port filter", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, port: "Miami, FL" })).toEqual([MATE]);
  });
  it("date filter: only an explicit OPEN matches", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, date: "2026-08-28" })).toEqual([CAPTAIN]);
  });
  it("date filter M-2: absent and non-OPEN dates are closed", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, date: "2026-08-29" })).toEqual([]);
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, date: "2026-12-25" })).toEqual([]);
  });
  it("verifiedOnly honors only verified === true", () => {
    expect(filterBoard(BOARD, { ...EMPTY_FILTERS, verifiedOnly: true })).toEqual([CAPTAIN]);
  });
  it("filters combine (AND)", () => {
    expect(
      filterBoard(BOARD, { role: "CAPTAIN", port: "Miami, FL", date: "", verifiedOnly: false }),
    ).toEqual([]);
  });
});

describe("boardWindowStart", () => {
  it("earliest date across all profiles", () => {
    expect(boardWindowStart(BOARD)).toBe("2026-08-28");
  });
  it("undefined on an empty board", () => {
    expect(boardWindowStart([])).toBeUndefined();
  });
});

/* getBoard/fetchBoard hold module-level cache state → fresh module per test. */
async function freshBoard() {
  vi.resetModules();
  return import("./board");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBoard", () => {
  it("throws on a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 500)));
    const { fetchBoard } = await freshBoard();
    await expect(fetchBoard()).rejects.toThrow("board fetch failed: 500");
  });
  it("throws on a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ profiles: "nope" })));
    const { fetchBoard } = await freshBoard();
    await expect(fetchBoard()).rejects.toThrow("board response malformed");
  });
  it("defaults missing credentials/availability to empty arrays", async () => {
    const bare = { ...CAPTAIN, credentials: undefined, availability: undefined };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ profiles: [bare] })));
    const { fetchBoard } = await freshBoard();
    const [p] = await fetchBoard();
    expect(p.credentials).toEqual([]);
    expect(p.availability).toEqual([]);
  });
});

describe("getBoard", () => {
  it("concurrent callers share one fetch; later calls hit the cache", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ profiles: [CAPTAIN] }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshBoard();
    const [a, b] = await Promise.all([mod.getBoard(), mod.getBoard()]);
    expect(a).toBe(b);
    await mod.getBoard();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("a failed fetch does not wedge retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(jsonResponse({ profiles: [CAPTAIN] }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await freshBoard();
    await expect(mod.getBoard()).rejects.toThrow();
    expect((await mod.getBoard())[0].id).toBe("c");
  });
});
```

- [ ] **Step 2: Run** — `cd apps/mobile && pnpm test`. Expected: all pass. (Note the top-of-file static import serves the stateless functions; the `freshBoard()` dynamic import isolates cache state — both intentional.)
- [ ] **Step 3: Root check** — `pnpm test` at root: web + mobile both green. Remove `--passWithNoTests` from the mobile script if Task 6 added it.
- [ ] **Step 4: Commit** — `[ai-assisted] mobile board logic tests: filter lockstep (M-2 absent=closed), window start, fetch guards, cache dedupe (no rules touched)`

---

### Task 8: Final verification + docs

**Files:**
- Modify: `HANDOFF.md` (the debt lines around L93-95)

- [ ] **Step 1: Full gates** — at root: `pnpm test`, `pnpm compliance:check`, `cd apps/web && npx tsc --noEmit && pnpm lint`, `cd apps/mobile && npx tsc --noEmit && pnpm lint`. All green.
- [ ] **Step 2: Live smoke of the 429 + cache** — `colima start && docker compose up -d postgres`, start `pnpm dev` in apps/web, then:

```bash
for i in $(seq 1 61); do curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/api/board; done; echo
curl -si http://localhost:3000/api/board | grep -iE "^HTTP|retry-after"
```

Expected: sixty `200`s then `429`; the follow-up shows `HTTP/1.1 429` with a `Retry-After` header. Then stop the dev server, postgres, and colima.

- [ ] **Step 3: Update HANDOFF.md** — replace the debt sentence "mobile has no unit-test runner yet (…) `/api/board` is unauthenticated + un-rate-limited (fine for demo scale, note before real traffic)" with: "mobile unit tests run via vitest (`lib/` pure logic; component behavior stays device-verified); `/api/board` is public by design and now per-IP rate-limited (60/min) with a 30s in-process payload cache — both per-instance, revisit with a shared store before multi-instance traffic. Credential server-action guards are unit-tested (spec §7)."
- [ ] **Step 4: Commit** — `[ai-assisted] hardening bundle closeout: HANDOFF debt lines updated, live 429 smoke verified (no rules touched)`

---

## Self-review notes

- Spec coverage: §1 → Tasks 1-3; §2 → Tasks 4-5; §3 → Tasks 6-7; error/compliance section → Task 3 step 2 + Task 8.
- Types used in tests match the real modules (`BeginUploadResult` union checked via `"error" in r`; prisma mock shape limited to methods the actions call).
- Guard tests assert on real behavior; the plan explicitly forbids bending a failing test to broken behavior.
