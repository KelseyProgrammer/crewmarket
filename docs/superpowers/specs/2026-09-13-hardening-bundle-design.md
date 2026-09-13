# Hardening Bundle — Design

**Date:** 2026-09-13 · **Status:** approved (scope + approaches + design user-approved in session)

Three items of recorded debt (HANDOFF.md, credential spec §7), no client dependency. Each lands
as its own commit. No schema changes, no new runtime dependencies, no copy changes beyond one
429 error string (M-1 gate re-run).

## 1. `/api/board` abuse hardening

The route stays **public by design** (mobile board feed; `toPublicProfile` allowlist already
strips private fields — V-2, D-3, P-4). Hardening = abuse resistance at demo scale, per
HANDOFF: "unauthenticated + un-rate-limited (fine for demo scale, note before real traffic)".

- **New `apps/web/lib/rate-limit.ts`** — pure fixed-window per-key limiter, zero dependencies:
  `checkRateLimit(key, { limit, windowMs, now }) → { allowed, retryAfterSec }` over a
  module-level Map; stale windows pruned opportunistically on calls. Clock injected for tests.
- **New `apps/web/lib/ttl-cache.ts`** — smallest possible TTL memo for the board payload:
  one entry, `~30s`, clock-injectable.
- **`app/api/board/route.ts`** — thin composition: derive caller key from first
  `x-forwarded-for` hop, else `x-real-ip`, else `"unknown"`; over-limit → 429 JSON
  (marketplace-voiced error string) + `Retry-After`; otherwise serve from the TTL cache,
  filling it via `boardData()` on miss. `Cache-Control: no-store` stays (caching is
  server-side; intermediaries stay dumb).
- **Limits:** 60 req/min per key. 30s TTL is invisible next to the mobile client's
  session-long cache; verify-flag flips reach mobile no later than they did before a restart.
- **Documented limitation** (code comment): per-instance, in-memory, resets on deploy —
  honest single-instance demo posture; revisit before real multi-instance traffic.
- **Tests:** limiter (window rollover, per-key isolation, retry-after math, pruning) and TTL
  cache (hit/miss/expiry) in web vitest. The route itself stays too thin to need mocking.

## 2. Credential server-action guard unit tests (spec §7 gap)

Unit tests with mocked seams in the existing `apps/web` vitest setup. Files beside the actions:
`app/account/credential-actions.test.ts`, `app/admin/credentials/actions.test.ts`.

Mocks: `@crewmarket/db` (prisma.credentialDoc CRUD), `lib/bookings` (`sessionUser`,
`claimedProfileId`), `lib/credential-storage` (`headObject`, `presignedPut/Get`,
`deleteObject`), `next/cache` (`revalidatePath` noop), `next/navigation` (`redirect` throws a
sentinel to assert target). `ADMIN_EMAILS` via env stub.

Matrix (from the 2026-09-04 credential spec §7):

| Guard | Cases |
|---|---|
| `beginCredentialUpload` | no session → redirect `/sign-in`; BOAT account → error; no claim → error; non-allowlisted kind → error; invalid type/size → error; happy path returns put URL + id + key |
| `confirmCredentialUpload` | foreign `s3Key` prefix → error (no HeadObject spent); tampered id↔key pairing → error; missing head → error; invalid head → `deleteObject` called + error; **happy-path `prisma.create` data contains no `verifiedAt` key** (crew input can never verify) |
| `deleteCredentialDoc` / `viewOwnCredentialDoc` | wrong profile → denied redirect; right profile but different `uploadedByUserId` (re-assigned claim) → denied, and S3 `deleteObject`/`presignedGet` **not** called |
| `setCredentialVerified` | non-allowlisted email → no `prisma.update`; admin verify → `verifiedAt` + `verifiedByEmail` written; unverify → both nulled |
| `viewCredentialDocAsAdmin` | non-admin → no presign |

## 3. Mobile unit-test runner (vitest, pure logic only)

- `apps/mobile` devDeps: `vitest` (version aligned with web). `vitest.config.ts`: node
  environment, include `lib/**/*.test.ts`. Script `"test": "vitest run"`. Join the root/turbo
  test pipeline if one exists (verify during implementation; add the smallest wiring if not).
- No `jest-expo`, no RN rendering — component behavior stays on the device-verification path.
- **`lib/board.test.ts`:**
  - `filterBoard`: each of the four filters; combined; M-2 lockstep semantics (a date absent
    from availability is closed, never assumed open); `verifiedOnly` honors only
    `verified: true`.
  - `boardWindowStart`: earliest date across profiles; `undefined` on empty board.
  - `fetchBoard` (mocked global fetch): non-ok status throws; non-array `profiles` throws;
    missing `credentials`/`availability` default to `[]`.
  - `getBoard`: concurrent callers share one in-flight fetch; a failed fetch clears the
    in-flight slot so retry works; cache returns without refetch. Module-state isolation via
    `vi.resetModules` + dynamic import per test.

## Error handling & compliance

- 429 body is a plain `{ error }` with marketplace vocabulary; `pnpm compliance:check` re-run.
- No user-visible behavior changes besides the 429 path; mobile's existing error+retry UI is
  the client-side story for rate-limited callers.

## Out of scope

Dep/font pruning (own pass, needs device verification), AWS swap bundle (waits on client
bucket), S3 orphan-object sweep, jest-expo/component testing, multi-instance rate limiting.
