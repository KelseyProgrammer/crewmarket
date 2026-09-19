# Design: Mobile Slice 4 — Crew Credential Upload

Date: 2026-09-19
Status: approved in session. Scope decided: full parity with the web credential
surface (list / upload / view / remove) on a dedicated mobile screen; camera +
photo library + file picker as sources; shared server service + thin REST routes
(Approach A).

## Context

Slices 1–3 shipped: board + profiles, native auth + claim, and booking management
with a bottom tab bar. Slice 2 put the account screen on the phone but deferred
credential upload. The server side already exists as Next.js **server actions**
(`apps/web/app/account/credential-actions.ts`, not callable from a native app):

- Protocol: `begin` (validate kind/type/size, mint `docId`, presign PUT) → client
  PUTs to the presigned URL → `confirm` (key-prefix guard, **HeadObject
  re-validation** — load-bearing, since a presigned PUT does not signature-bind
  Content-Type — key re-derivation binding id↔key↔content-type, then DB row).
- `deleteCredentialDoc` / `viewOwnCredentialDoc` are uploader-bound, not just
  claim-bound (V-2: a re-assigned claim never exposes the previous person's docs).
- Rules live in `apps/web/lib/credential-rules.ts` (PDF/JPEG/PNG, ≤10 MB, key
  shape); storage in `apps/web/lib/credential-storage.ts` (MinIO dev, presigned
  PUT 300s / GET 60s).

Mobile talks to the web app via REST routes (`/api/me`, `/api/bookings`…) using
`authClient.$fetch` with the Better Auth session token; routes authenticate via
`auth.api.getSession({ headers })`.

## Guiding decisions

- **Dedicated screen**, pushed from a "Credentials" row on the Account tab (crew
  with a claimed profile only). Account stays lean, matching how bookings got
  their own screens.
- **Three file sources**: take a photo (crew-side is mobile-first — snapping a
  license is the core flow), photo library, file picker for PDFs.
- **Full parity**: list with verified/self-reported state, upload, View
  (short-lived presigned GET in the browser), Remove. Remove keeps today's web
  behavior — the pending client policy decision on deleting verified docs will
  land later in the one shared service, changing both surfaces at once.
- **Approach A** for the API layer: extract a shared credential service; the
  server actions and the new REST routes are both thin wrappers. The
  security-critical guards (V-1/V-2) live in exactly one place.

## 1. Server refactor — extract the credential service

`apps/web/lib/credential-service.ts` — plain functions, no `redirect()` /
`revalidatePath()`, returning `{ error }` or data:

```ts
export type CredCtx = { user: { id: string }, profileId: string };

// CREW + claimed-profile check. Returns ctx or a typed error the caller maps
// to a redirect (web) or a 4xx JSON body (API).
export async function credentialGuard(user): Promise<CredCtx | { error, status }>

export async function listDocs(profileId)          // same select as web section — never s3Key
export async function beginUpload(ctx, { kind, contentType, sizeBytes })
  // → { putUrl, docId, s3Key } | { error }
export async function confirmUpload(ctx, { docId, s3Key, kind, licenseClass?, expiresAt? })
  // all existing guards moved verbatim: key-prefix pre-check, licenseClass/expiry
  // validation, HeadObject re-validate + delete-on-reject, key re-derivation
  // binding, P2002 → "already saved"
export async function deleteDoc(ctx, docId)        // uploader-bound; S3 first, then row (V-2)
export async function viewUrl(ctx, docId)          // uploader-bound; → { url } (60s presigned GET)
```

- `credential-actions.ts` becomes thin wrappers: call the service, keep the
  existing `redirect`/`revalidatePath` behavior. Web `/account` behavior is
  unchanged; the logic moves **verbatim**.
- The existing guard tests in `credential-actions.test.ts` keep passing (they
  exercise the same logic through the actions); assertions are not weakened.

## 2. New auth-gated API routes (template: `/api/bookings`)

All `force-dynamic`, session via `auth.api.getSession({ headers })`, 401 when
signed out, `{ error }` JSON with proper status codes otherwise. Nothing in these
routes logs keys or URLs (V-2).

| Route | Purpose |
|---|---|
| `GET  /api/credentials` | Caller's doc list: id, kind, licenseClass, expiresAt, uploadedAt, verifiedAt |
| `POST /api/credentials/begin` | body `{kind, contentType, sizeBytes}` → `{putUrl, docId, s3Key}` |
| `POST /api/credentials/confirm` | body `{docId, s3Key, kind, licenseClass?, expiresAt?}` → `{}` |
| `DELETE /api/credentials/[id]` | Remove (today's behavior; policy decision pending with client) |
| `POST /api/credentials/[id]/view` | → `{url}` — POST, not GET, so nothing caches/prefetches a URL-minting endpoint (V-2) |

## 3. Mobile screen — `src/app/credentials.tsx`

- Entry: "Credentials" row inside the Account tab's crew panel, shown only when
  the crew account has a claimed profile.
- Visuals follow the slice 1–3 design system (`lib/tokens.ts`: navy header,
  white panels, brass accents). Kind labels mirrored into
  `apps/mobile/lib/credential-labels.ts` (pattern: `booking-labels.ts`).
- **List**: kind label, license class, expiry, uploaded date, and state using
  the web's exact wording — "Verified — document reviewed" /
  "Self-reported — awaiting review" (V-1 visual distinction, V-3-safe copy:
  about the document, never competence).
- **Row actions**: View → `POST …/view`, open `{url}` with `expo-web-browser`;
  Remove → native confirm alert, then `DELETE`.
- **Add document**: kind picker (from the shared `Credential` zod shape via
  `@crewmarket/types`), optional license class + expiry (`YYYY-MM-DD`) fields,
  then three source buttons: **Take photo** (`expo-image-picker` camera),
  **Photo library** (`expo-image-picker`), **Choose file**
  (`expo-document-picker`).

## 4. Upload flow (client)

1. Pre-check locally: content type ∈ {pdf, jpeg, png}, size ≤ 10 MB — mirror
   `validateUpload`'s user-facing messages so client and server agree.
   Camera/library captures request JPEG with capped quality so phone photos stay
   under the limit.
2. `POST /api/credentials/begin`.
3. `FileSystem.uploadAsync(putUrl, fileUri, { httpMethod: "PUT", headers:
   { "Content-Type": type } })` — binary straight from the file URI, no base64
   round-trip.
4. `POST /api/credentials/confirm`, then re-fetch the list.

In-flight state disables the form (single upload at a time); any step's failure
surfaces the server's error string inline with retry. A failed confirm leaves at
most an orphan S3 object — already covered by `scripts/sweep-orphan-credentials.mjs`.

## 5. Auth & edge states

Same `authGuardState` discipline as the account screen: SIGNED_OUT → redirect to
sign-in; UNKNOWN → retry panel; CHECKING → spinner. Non-crew accounts and
unclaimed crew see the claim-your-profile guidance instead of the form (the
Account row is hidden for them too — the screen still guards itself for
deep-links). Mid-upload 401 (session died between begin and confirm) shows the
sign-in prompt.

## 6. Compliance

- **V-1**: mobile never reads or writes `verifiedAt` except to render state;
  verification stays admin-set only.
- **V-2**: docs private; presigned URLs short-lived; keys/URLs never logged;
  uploader-bound guards unchanged; list responses never include `s3Key`
  (begin/confirm carry it only as the opaque round-trip token the web flow
  already uses).
- **M-1**: copy reuses the web's reviewed-document vocabulary;
  `pnpm compliance:check` stays green.
- **D-2**: not triggered — this is not a signup/profile/booking surface.
- No new data modeling; same `credential_doc` table and Prisma schema.

## 7. Testing

- **Service**: existing `credential-actions.test.ts` guard tests keep passing
  unchanged (actions wrap the service); no assertion is weakened by the move.
- **Routes**: new tests mirroring the `/api/bookings` style — 401 signed out,
  non-crew rejected, unclaimed rejected, foreign-doc denial (uploader-bound),
  happy paths with mocked storage, begin/confirm validation errors.
- **Mobile**: pure-logic vitest units only (labels, client-side validation,
  upload state machine) — no RN rendering tests, per slices 1–3.
- **Gates**: `pnpm build` (web tsconfig is strict:false — no boolean-discriminant
  narrowing; vitest won't catch what only the build does), `pnpm lint`,
  `pnpm compliance:check`.
- **Device pass** (user, at the end): requires `S3_ENDPOINT` in
  `apps/web/.env.local` set to the Mac's **LAN IP**, not localhost — presigned
  URLs embed the signing host, and the phone can't reach `localhost:9000`. Fold
  this into the mobile run recipe. The Vercel deployment cannot host this
  slice's test until the real AWS bucket lands (no reachable bucket there).

## Out of scope

- Verified-doc deletion policy change (client decision pending —
  `docs/CLIENT-DECISIONS-2026-09-16.md`); Remove keeps current behavior.
- AWS bucket swap and `TODO(aws)` hardening (separate roadmap item).
- Admin review surfaces on mobile (web-only).
- Boat-side anything (slice 5).
