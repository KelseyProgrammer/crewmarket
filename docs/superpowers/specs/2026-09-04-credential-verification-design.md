# Design: Credential upload + admin verify (V-1/V-2)

Date: 2026-09-04
Status: approved (storage, admin-gate, and profile-surfacing decisions made with
user; SOW 2.i "Credential Verification" phase, SOW 2.ii scope guard respected)

## Decisions (made with user 9/4/2026)

- **Storage**: MinIO in `docker-compose.yml` for dev; code targets the S3 API
  via `@aws-sdk/client-s3` + request presigner, so the client's real AWS bucket
  is an env-only swap later (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`,
  `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`).
- **Admin gate**: `ADMIN_EMAILS` env allowlist (comma-separated), checked
  server-side against the session email. No schema change, nothing reachable
  from sign-up, revocation is an env edit.
- **Profile surfacing**: claimed profiles with uploaded docs render credentials
  from the DB (structured fields + verified state); unclaimed profiles keep
  synthetic seed credentials. Directory seal + verified-only filter get the
  same override so board and profile never disagree.

## 1. Data model (`packages/db`)

New `CredentialDoc` model:

| field | type | notes |
|---|---|---|
| id | cuid | |
| profileId | string | seed profile UUID; must match uploader's `CrewProfileClaim` |
| uploadedByUserId | string FK → user | cascade delete |
| kind | string | existing `Credential.kind` values only — no new kinds, nothing medical (D-1) |
| licenseClass | string? | e.g. "Master 100T" |
| expiresAt | date? | expiry tracking (V-1) |
| s3Key | string unique | never logged (V-2) |
| contentType | string | allowlist: application/pdf, image/jpeg, image/png |
| sizeBytes | int | ≤ 10 MB enforced server-side |
| uploadedAt | timestamp | |
| verifiedAt | timestamp? | **the** verified flag: null = self-reported |
| verifiedByEmail | string? | admin who reviewed |

There is no client-writable `verified` boolean; verification state exists only
as `verifiedAt`, which only the admin action writes (V-1 structurally).
Proper migration (pipeline is clean as of 9/4).

## 2. Storage helper (`apps/web/lib/credential-storage.ts`, server-only)

- `presignedPut(key, contentType)` / `presignedGet(key)` — short expiries
  (PUT 60s, GET 60s).
- Key format: `credentials/{profileId}/{cuid}.{ext}` — extension derived from
  the validated content type, never from the client filename.
- Bucket is private; MinIO bucket auto-created on first use in dev.
- S3 keys and presigned URLs never appear in logs (V-2).

## 3. Crew upload flow (`/account`, crew branch, claim required)

- Credentials section lists own docs: kind, class, expiry, uploaded date, and
  state — **Self-reported** vs **Verified — document reviewed** (V-1 visual
  distinction; V-3 wording: document review, not a competence guarantee).
- Upload form: kind (fixed list), licenseClass, expiresAt, file. Server action:
  session → claim check → content-type/size validation → DB row + presigned
  PUT; client PUTs directly; confirm action marks the row uploaded.
- Crew may delete or replace their own docs. Replacing or re-uploading clears
  `verifiedAt` (new file has not been reviewed).
- Owner may view their own doc via short-lived presigned GET.

## 4. Admin (`/admin/credentials`)

- Access: session email ∈ `ADMIN_EMAILS`, enforced in the page and re-checked
  in every server action. Not linked from any nav.
- Table grouped by profile: doc fields, uploader email, **View** (presigned
  GET) and **Verify / Unverify** toggle → stamps/clears `verifiedAt` +
  `verifiedByEmail`.
- Nothing further: review tooling beyond the flag is out of scope (SOW 2.ii).

## 5. Public surfacing

- `apps/web/app/crew/[id]`: if the profile has a claim **and** ≥1 uploaded
  doc, the credentials block renders from the DB; otherwise seed data.
  Document links never render publicly — structured fields + verified state
  only (V-2/V-3).
- Directory: verified seal + verified-only filter consult the DB override for
  claimed profiles with docs so the board never contradicts the profile page.

## 6. Copy & compliance

- Verified label: "Verified — document reviewed" (V-3 honesty). All new copy
  runs through `pnpm compliance:check` (M-1).
- D-2 disclaimer already renders via the persistent footer on all pages.
- No SSN/bank/tax fields anywhere (P-1 stays Stripe-owned); no medical fields
  (D-1); coarse location untouched (D-3).

## 7. Testing

- Server-action guards: upload rejected without session/claim; verify rejected
  for non-allowlisted email; no code path writes `verifiedAt` from crew input.
- Storage helper: content-type allowlist, size cap, key format (no client
  filename leakage).
- UI: self-reported vs verified rendering distinction.
- Demo: script seeds a claimed profile + synthetic PDF so the full loop
  (upload → admin verify → seal on profile) is drivable locally.

## Out of scope

Real AWS wiring (env swap when client bucket arrives), credential-expiry
notifications, admin metrics (separate phase), mobile parity.
