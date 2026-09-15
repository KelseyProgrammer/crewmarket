# Mobile Slice 2 — Auth + Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Native mobile auth (Better Auth Expo plugin) + the first real "claim a profile" path, per `docs/superpowers/specs/2026-09-15-mobile-slice2-auth-claim-design.md`.

**Architecture:** Enable the Better Auth `expo()` plugin server-side (bearer tokens for native; web cookies unchanged) + `trustedOrigins`. Add two auth-gated JSON routes: `POST /api/claim` (CREW-only, enforces the 1:1 uniqueness + V-2 doc guard) and `GET /api/me`. On mobile: an Expo auth client with secure-store token persistence, native sign-in/sign-up (with verbatim D-2) + account screens, and a claim button on the profile screen driven by a pure, unit-tested state helper.

**Tech Stack:** Better Auth 1.3 + `@better-auth/expo`, Next 15 route handlers, Expo SDK 57 / expo-router, expo-secure-store, vitest.

**Compliance:** M-1 (copy lint), V-2 (claim doc guard), P-4 (own-data only), D-2 (verbatim disclaimer on signup), M-2/M-3 (claim is opt-in, no supervision). Cite rule IDs in commits.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/web/lib/auth.ts` | + `expo()` plugin, `trustedOrigins` (modify) |
| `apps/web/package.json` | + `@better-auth/expo` (modify) |
| `apps/web/app/api/claim/route.ts` | `POST /api/claim` (create) |
| `apps/web/app/api/claim/route.test.ts` | claim rule matrix (create) |
| `apps/web/app/api/me/route.ts` | `GET /api/me` (create) |
| `apps/web/app/api/me/route.test.ts` | me shape/auth (create) |
| `apps/mobile/lib/claim-state.ts` | pure claim-button-state helper (create) |
| `apps/mobile/lib/claim-state.test.ts` | helper tests (create) |
| `apps/mobile/lib/auth-client.ts` | Expo auth client (create) |
| `apps/mobile/package.json` | + better-auth, @better-auth/expo, expo-secure-store (modify) |
| `apps/mobile/src/app/sign-in.tsx` | sign-in screen (create) |
| `apps/mobile/src/app/sign-up.tsx` | sign-up screen + D-2 (create) |
| `apps/mobile/src/app/account.tsx` | account + sign-out (create) |
| `apps/mobile/src/app/_layout.tsx` | header account/sign-in entry (modify) |
| `apps/mobile/src/app/crew/[id].tsx` | claim button (modify) |

---

### Task 1: Enable Better Auth Expo plugin (server)

**Files:** `apps/web/lib/auth.ts`, `apps/web/package.json`

- [ ] **Step 1: Add dep**

```bash
pnpm --filter web add @better-auth/expo
```

- [ ] **Step 2: Wire the plugin + trustedOrigins** in `apps/web/lib/auth.ts`:

Add import `import { expo } from "@better-auth/expo";`, change `plugins: [nextCookies()]` to `plugins: [expo(), nextCookies()]`, and add to the `betterAuth({...})` config (top level):

```ts
  trustedOrigins: [
    "crewmarket://",
    "http://localhost:3000",
    "http://localhost:3002",
    "https://crewmarket-web.vercel.app",
  ],
```

- [ ] **Step 3: Verify web still builds + existing tests pass**

Run: `pnpm --filter web test && pnpm build`
Expected: green (auth changes are additive; cookie flow unchanged).

- [ ] **Step 4: Verify session resolution works for a bearer token.** Sanity-check that `auth.api.getSession({ headers })` reads the Expo client's token. If a quick manual check isn't feasible pre-mobile, note the assumption and confirm in the device pass; **if** later tasks find `getSession` doesn't resolve the native token, add the `bearer()` plugin (`import { bearer } from "better-auth/plugins"`, add to `plugins`) — the Expo plugin normally covers this, so try without first.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth.ts apps/web/package.json pnpm-lock.yaml
git commit -m "[ai-assisted] mobile: Better Auth Expo plugin + trustedOrigins for native auth (no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 2: `POST /api/claim` (TDD)

**Files:** `apps/web/app/api/claim/route.test.ts`, `apps/web/app/api/claim/route.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/app/api/claim/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  prisma: {
    crewProfileClaim: { findUnique: vi.fn(), create: vi.fn() },
    credentialDoc: { count: vi.fn() },
  },
}));

vi.mock("../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
// A real seed profile id exists; use one from the JSON. Mock the seed import to a known set.
vi.mock("../../../data/seed-crew.json", () => ({
  default: { profiles: [{ id: "p-known", displayName: "Test Crew", roles: ["MATE"] }] },
}));

import { POST } from "./route";

const CREW = { id: "u1", email: "c@x.test", accountType: "CREW" };

function post(body: unknown) {
  return POST(new Request("http://localhost/api/claim", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: CREW });
  seams.prisma.crewProfileClaim.findUnique.mockResolvedValue(null); // no existing claim (either key)
  seams.prisma.credentialDoc.count.mockResolvedValue(0);
  seams.prisma.crewProfileClaim.create.mockResolvedValue({ userId: "u1", profileId: "p-known" });
});

describe("POST /api/claim", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await post({ profileId: "p-known" })).status).toBe(401);
  });
  it("403 for non-crew", async () => {
    seams.getSession.mockResolvedValue({ user: { ...CREW, accountType: "BOAT" } });
    expect((await post({ profileId: "p-known" })).status).toBe(403);
  });
  it("404 for unknown profile", async () => {
    expect((await post({ profileId: "nope" })).status).toBe(404);
  });
  it("409 when the user already has a claim", async () => {
    seams.prisma.crewProfileClaim.findUnique.mockImplementation(({ where }: any) =>
      where.userId ? { userId: "u1", profileId: "other" } : null);
    expect((await post({ profileId: "p-known" })).status).toBe(409);
    expect(seams.prisma.crewProfileClaim.create).not.toHaveBeenCalled();
  });
  it("409 when the profile is already claimed", async () => {
    seams.prisma.crewProfileClaim.findUnique.mockImplementation(({ where }: any) =>
      where.profileId ? { userId: "someoneelse", profileId: "p-known" } : null);
    expect((await post({ profileId: "p-known" })).status).toBe(409);
    expect(seams.prisma.crewProfileClaim.create).not.toHaveBeenCalled();
  });
  it("409 (V-2) when the profile has credential docs", async () => {
    seams.prisma.credentialDoc.count.mockResolvedValue(2);
    expect((await post({ profileId: "p-known" })).status).toBe(409);
    expect(seams.prisma.crewProfileClaim.create).not.toHaveBeenCalled();
  });
  it("200 and creates the claim on the happy path", async () => {
    const res = await post({ profileId: "p-known" });
    expect(res.status).toBe(200);
    expect(seams.prisma.crewProfileClaim.create).toHaveBeenCalledWith({
      data: { userId: "u1", profileId: "p-known" },
    });
  });
  it("maps a P2002 unique-collision to 409", async () => {
    seams.prisma.crewProfileClaim.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await post({ profileId: "p-known" })).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- app/api/claim`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement** `apps/web/app/api/claim/route.ts`:

```ts
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
```

Note: the tests mock `next/headers`? They call `POST(new Request(...))` directly; `headers()` from `next/headers` must resolve in the test env. Add `vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))` to the test seams if the run complains. Adjust the test's auth mock accordingly (getSession ignores the headers arg — it's fully mocked).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- app/api/claim`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/claim
git commit -m "[ai-assisted] mobile: POST /api/claim — first real claim path, CREW-only + 1:1 uniqueness + V-2 doc guard (V-2, M-2; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 3: `GET /api/me` (TDD)

**Files:** `apps/web/app/api/me/route.test.ts`, `apps/web/app/api/me/route.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/app/api/me/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  claimedProfileId: vi.fn(),
}));
vi.mock("../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("../../../lib/bookings", () => ({ claimedProfileId: seams.claimedProfileId }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: { id: "u1", accountType: "CREW" } });
  seams.claimedProfileId.mockResolvedValue(null);
});

describe("GET /api/me", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("returns id, accountType, claimedProfileId (null)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "u1", accountType: "CREW", claimedProfileId: null });
  });
  it("includes the claimed profile id when present", async () => {
    seams.claimedProfileId.mockResolvedValue("p-known");
    expect((await (await GET()).json()).claimedProfileId).toBe("p-known");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter web test -- app/api/me` → FAIL (no `./route`).

- [ ] **Step 3: Implement** `apps/web/app/api/me/route.ts`:

```ts
import { headers } from "next/headers";
import { auth } from "../../../lib/auth";
import { claimedProfileId } from "../../../lib/bookings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string; accountType?: string };
  return Response.json({
    id: user.id,
    accountType: user.accountType ?? null,
    claimedProfileId: await claimedProfileId(user.id),
  });
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm --filter web test -- app/api/me` → 3 passing. Then `pnpm --filter web test && pnpm build && pnpm compliance:check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/me
git commit -m "[ai-assisted] mobile: GET /api/me — session role + claimed profile id, own-data only (P-4; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 4: Pure claim-button-state helper (TDD)

**Files:** `apps/mobile/lib/claim-state.test.ts`, `apps/mobile/lib/claim-state.ts`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/lib/claim-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { claimButtonState } from "./claim-state";

const me = (over = {}) => ({ id: "u1", accountType: "CREW", claimedProfileId: null, ...over });

describe("claimButtonState", () => {
  it("signed out -> prompt to sign in", () => {
    expect(claimButtonState(null, "p1")).toBe("SIGNED_OUT");
  });
  it("boat -> hidden", () => {
    expect(claimButtonState(me({ accountType: "BOAT" }), "p1")).toBe("HIDDEN");
  });
  it("crew, no claim -> claimable", () => {
    expect(claimButtonState(me(), "p1")).toBe("CLAIMABLE");
  });
  it("crew, this profile is theirs -> owned", () => {
    expect(claimButtonState(me({ claimedProfileId: "p1" }), "p1")).toBe("OWNED");
  });
  it("crew, drives a different profile -> hidden", () => {
    expect(claimButtonState(me({ claimedProfileId: "p2" }), "p1")).toBe("HIDDEN");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @crewmarket/mobile test -- claim-state` (or the mobile package name; check `apps/mobile/package.json` `name`). FAIL — module missing.

- [ ] **Step 3: Implement** `apps/mobile/lib/claim-state.ts`:

```ts
export type Me = { id: string; accountType: string; claimedProfileId: string | null };
export type ClaimButtonState = "SIGNED_OUT" | "HIDDEN" | "CLAIMABLE" | "OWNED";

/** Pure UI decision for the profile-screen claim button (M-2: claiming is opt-in). */
export function claimButtonState(me: Me | null, profileId: string): ClaimButtonState {
  if (!me) return "SIGNED_OUT";
  if (me.accountType !== "CREW") return "HIDDEN";
  if (me.claimedProfileId === profileId) return "OWNED";
  if (me.claimedProfileId) return "HIDDEN"; // drives a different profile
  return "CLAIMABLE";
}
```

- [ ] **Step 4: Run to verify pass** — 5 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/claim-state.ts apps/mobile/lib/claim-state.test.ts
git commit -m "[ai-assisted] mobile: pure claim-button-state helper, tested (M-2; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 5: Mobile auth client + deps

**Files:** `apps/mobile/lib/auth-client.ts`, `apps/mobile/package.json`

- [ ] **Step 1: Add deps**

```bash
pnpm --filter @crewmarket/mobile add better-auth @better-auth/expo expo-secure-store
```

(Use the actual mobile package name from `apps/mobile/package.json`.)

- [ ] **Step 2: Implement** `apps/mobile/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: "crewmarket", storagePrefix: "crewmarket", storage: SecureStore }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
```

- [ ] **Step 3: Verify typecheck + expo config**

Run: `pnpm --filter @crewmarket/mobile exec tsc --noEmit` (or the package's `typecheck` script). Also confirm `app.json` scheme is `"crewmarket"` (it is). Expected: no type errors.

Note: `@better-auth/expo` requires the app scheme + secure store; both are set. If TS complains about the `expoClient` storage type, match the version's expected `SecureStore` shape (pass the module directly per Better Auth Expo docs).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/auth-client.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "[ai-assisted] mobile: Expo auth client (secure-store token persistence) (no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 6: Sign-in / sign-up / account screens + header

**Files:** `apps/mobile/src/app/sign-in.tsx`, `sign-up.tsx`, `account.tsx`, `_layout.tsx` (modify)

Read the existing `src/app/index.tsx` and `_layout.tsx` first to match tokens (`lib/tokens.ts`), header style, and component conventions (StyleSheet, navy/brass). Build native forms with `TextInput`, a role toggle, and the D-2 checkbox (reuse `components/disclaimer-d2.tsx`). Screens are device-verified (no unit tests), but MUST pass `tsc --noEmit`, `expo lint`, and `pnpm compliance:check`.

- [ ] **Step 1: `sign-up.tsx`** — fields name/email/password, a CREW/BOAT segmented toggle, and a required D-2 checkbox rendering `<DisclaimerD2 />` prefixed "I understand the following:". Submit → `signUp.email({ name, email, password, accountType, disclaimerAccepted: true })`; on error show the server message; on success `router.replace("/account")`. Block submit until the checkbox is checked.

- [ ] **Step 2: `sign-in.tsx`** — email/password → `signIn.email({ email, password })`; link to `/sign-up`; on success `router.replace("/account")` (or back to board).

- [ ] **Step 3: `account.tsx`** — `useSession()`; if no session, `router.replace("/sign-in")`. Show name, role; for crew, fetch `/api/me` (through the authed client / `authClient.$fetch("/api/me")`) and show the claimed profile name (look up via the board cache `getBoard()`), or a "claim your profile from the board" hint. **Sign out** button → `signOut()` → `router.replace("/")`.

- [ ] **Step 4: `_layout.tsx`** — add a header-right button: `useSession()` → if signed in, an "Account" button → `/account`; else a "Sign in" button → `/sign-in`. Match the navy header.

- [ ] **Step 5: Verify** — `pnpm --filter @crewmarket/mobile exec tsc --noEmit && pnpm --filter @crewmarket/mobile lint && pnpm compliance:check`. Also `pnpm --filter @crewmarket/mobile exec expo export --platform ios` if feasible (catches bundling errors) — if the export is slow/environmental, rely on tsc+lint and note it.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app
git commit -m "[ai-assisted] mobile: native sign-in/sign-up (verbatim D-2) + account screen + header entry (D-2, M-1; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 7: Claim button on the profile screen

**Files:** `apps/mobile/src/app/crew/[id].tsx` (modify)

- [ ] **Step 1: Wire it** — read the current profile screen. Add: fetch `/api/me` when a session exists (via `authClient.$fetch("/api/me")` or `fetch(API_URL + "/api/me")` with the client's session), compute `claimButtonState(me, profile.id)` (Task 4 helper). Render:
  - `SIGNED_OUT` → a subtle "Sign in to claim this profile" link → `/sign-in`.
  - `CLAIMABLE` → brass button "This is my profile — claim it" → `POST /api/claim { profileId }` via the authed client; on `200` set state to `OWNED` + toast/inline "You drive this profile"; on `409` show the server error message inline.
  - `OWNED` → an "You drive this profile" badge.
  - `HIDDEN` → nothing.
  Match the registry-plate styling + tokens; keep copy M-1 clean.

- [ ] **Step 2: Verify** — `tsc --noEmit`, `expo lint`, `pnpm compliance:check`, and `pnpm --filter @crewmarket/mobile test` (the helper test still green).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/crew
git commit -m "[ai-assisted] mobile: claim button on the profile screen via /api/claim + state helper (M-2, V-2; no rules touched)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QyyzA4ADf5wZ5L3yiNdqAw"
```

---

### Task 8: Full verification + deploy server changes

- [ ] **Step 1: Whole-workspace gates** — `pnpm lint && pnpm test && pnpm build && pnpm compliance:check`. Fix red, re-run.

- [ ] **Step 2: Deploy the server** so the device pass can hit the live API: `git push origin main` (auto-deploys to Vercel). Wait for Ready; smoke-check `GET /api/me` returns 401 signed-out and `/api/board` still 200 on `https://crewmarket-web.vercel.app`.

- [ ] **Step 3: Commit** any fixes from Step 1 (server routes deploy with the push).

---

### Task 9: Device pass (user, Expo Go)

- [ ] **Step 1:** With `EXPO_PUBLIC_API_URL` pointed at `https://crewmarket-web.vercel.app` (or local `:3002`), run `cd apps/mobile && npx expo start`; open in Expo Go on a physical iPhone (slice-1 recipe).
- [ ] **Step 2:** Verify: sign up as CREW (D-2 required), sign up as BOAT, sign in, session persists across an app restart, open a crew profile → claim it → account shows the claim, sign out. Confirm a boat account sees no claim button.
- [ ] **Step 3:** Record any device-only bugs (slice-1 caught layout/nav issues the gates couldn't) and fix. Update HANDOFF with the slice-2 state + run recipe.

---

## Self-review notes (spec → task map)

- Spec §1 Expo plugin + trustedOrigins → Task 1.
- Spec §2 /api/claim rules (401/403/404/409×3/200 + P2002) → Task 2 (full matrix).
- Spec §3 /api/me → Task 3.
- Spec §6 claim-button logic → Task 4 (pure helper, unit-tested) + Task 7 (wiring).
- Spec §4 auth client → Task 5; §5 screens + D-2 → Task 6.
- Spec §7 compliance → gates in every task (M-1 lint, V-2 in Task 2, D-2 in Task 6, P-4 in Task 3).
- Spec §8 testing → unit in Tasks 2/3/4; device pass Task 9. §9 deploy → Task 8.
- Scope boundary respected: no booking management on mobile; boats still hand off to web.
