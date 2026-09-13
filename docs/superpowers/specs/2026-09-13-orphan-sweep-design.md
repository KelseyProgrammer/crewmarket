# S3 Orphan-Object Sweep — Design

**Date:** 2026-09-13 · **Status:** approved (trigger, safety, approach user-approved in session)

Closes the credential-phase follow-up (HANDOFF): uploads that call `beginCredentialUpload` and
PUT the object but never confirm leave an object in the bucket with no `credentialDoc` row.

## Shape

One self-contained ops script, `scripts/sweep-orphan-credentials.mjs`, following the existing
root-script pattern (`createRequire` through `packages/db` for `@prisma/client` and through
`apps/web` for `@aws-sdk/client-s3`; run with `node --env-file=.env.local`). No new packages,
no app surface, no schema changes.

## Behavior

1. List every object under `credentials/` (paginated `ListObjectsV2`, 1000/page) →
   `{ key, lastModified }`.
2. Load every `credentialDoc.s3Key` from postgres → row-key set.
3. **Orphan** = object with no row AND `now - lastModified` ≥ the age gate.
   Age gate defaults to **24h** (presigned PUTs expire in 300s, so nothing in-flight can ever
   be 24h old); `--min-age-hours N` overrides (0 allowed — rehearsal/operator use).
4. **Dangling row** = row whose object is missing. **Report-only, never deleted** — whether
   verified docs may be removed at all is the open client policy question.
5. Default run is a **dry run**: prints each orphan key + age, each dangling row id, counts,
   and a "nothing removed — pass --delete" banner. Exit 0.
6. `--delete`: deletes eligible orphans one at a time; a per-key failure is reported and the
   sweep continues; exit 1 if any delete failed, else 0 with a deleted count.
7. V-2: keys are printed to the operator console only (opaque profileId/docId ids); presigned
   URLs are never generated or printed.

## Verification (live rehearsal, no unit tests)

Matches how the other ops scripts are validated. With postgres + minio up:
seed a legit doc via `scripts/demo-credential-drive.mjs`; PUT one raw object directly (no DB
row); dry-run lists exactly that orphan; `--delete --min-age-hours 0` removes it; re-run shows
zero orphans; the legit doc's row and object are both still present.

## Docs

HANDOFF ops section gains the run recipe and closes the follow-up line.

## Out of scope

Real-AWS lifecycle rules (AWS-swap bundle, infra-as-code), any handling of dangling rows
beyond reporting, admin-UI trigger, scheduled runs.
