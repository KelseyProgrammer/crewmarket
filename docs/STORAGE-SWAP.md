# Credential-doc storage swap — MinIO (dev) → real bucket (Cloudflare R2)

> **DONE 10/7/2026.** Bucket `credential-docs` (ENAM) live on the client-side
> Cloudflare account, Object-R/W scoped token, CORS policy set, six `S3_*` vars on
> crewmarket-web production. Full verify checklist below passed (scripted against
> production). One code fix came out of it: `ensureBucket` now probes with
> HeadBucket instead of unconditionally creating (the scoped token has no
> CreateBucket right — commit `32fe10c`). Kept as the runbook for the eventual
> AWS-production swap.

The app's storage layer (`apps/web/lib/credential-storage.ts`) is already a pure env
swap: any S3-compatible store works via `S3_*` vars. Dev uses MinIO (docker compose);
the deployed API has **no object store**, so credential uploads error on
crewmarket-web / the crewmarket-demo link. This doc is the ~15-minute recipe to fix
that. **Recommended provider: Cloudflare R2** — S3-compatible (zero code change),
free tier (10 GB) covers the demo era, no egress fees, simplest token model. AWS S3
works identically if the client prefers it (same vars, plus region/IAM specifics).

## One-time: create the bucket + token (needs a Cloudflare account)

1. Cloudflare dashboard → R2 → **Create bucket**: name `credential-docs`
   (matches the `S3_BUCKET` default), location = Eastern North America (ENAM).
2. R2 → **Manage API tokens** → Create token: permission **Object Read & Write**,
   scoped to ONLY the `credential-docs` bucket. Note the Access Key ID / Secret
   Access Key, and the account id from the endpoint shown
   (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
3. **CORS — required for the web demo, easy to miss.** Browser uploads PUT directly
   to the presigned bucket URL, which is cross-origin from the demo page. MinIO is
   permissive by default so local web testing never surfaced this; R2 blocks it until
   the bucket has a CORS policy. Bucket → Settings → CORS policy:

   ```json
   [
     {
       "AllowedOrigins": [
         "https://crewmarket-demo.vercel.app",
         "https://crewmarket-web.vercel.app"
       ],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Native mobile (Expo Go / EAS) does not enforce CORS — this is for browsers only.

## Point the deployed API at it

Set on the `crewmarket-web` Vercel project (production), all marked Sensitive:

```bash
vercel env add S3_ENDPOINT production          # https://<ACCOUNT_ID>.r2.cloudflarestorage.com
vercel env add S3_ACCESS_KEY production        # R2 token Access Key ID
vercel env add S3_SECRET_KEY production        # R2 token Secret Access Key
vercel env add S3_BUCKET production            # credential-docs
vercel env add S3_REGION production            # auto   (R2's required region value)
vercel env add S3_FORCE_PATH_STYLE production  # true   (R2 endpoint is account-scoped; bucket goes in the path)
```

Then redeploy the API (`vercel redeploy` on crewmarket-web, or push to main).
No code change: the module already branches on `S3_ENDPOINT` + static keys, and its
`ensureBucket()` tolerates the bucket pre-existing.

## Verify (test accounts, synthetic docs only — never real credentials)

1. Live demo (crewmarket-demo.vercel.app) → sign in `mate@example.com` → Account →
   Credentials → **Choose file** → upload a synthetic PDF → row appears
   self-reported. (This exercises presign → browser PUT (CORS) → HeadObject confirm.)
2. **View** on the row opens the doc (presigned GET, 60s expiry).
3. `/admin/credentials` on crewmarket-web (admin allowlist) → verify the row → badge
   flips on the profile (V-1: `verifiedAt` admin-set only).
4. **Remove** the row → gone (S3-first delete ordering).
5. Spot-check privacy: the bucket stays private — opening the object URL *without*
   the presigned query string must 403 (V-2).

## Follow-ups once this lands

- Update docs/WEB-DEMO.md: delete the "uploads won't persist" limitation.
- Re-run the orphan sweep against the real bucket once real uploads exist
  (`scripts/sweep-orphan-credentials.mjs`, dry-run first).
- The `TODO(aws)` notes in `credential-storage.ts` (move CreateBucket out of app
  code, IAM-role auth, infra-as-code bucket policy) are the *AWS-production* track —
  not needed for the R2 demo bucket; revisit at real launch.
- If the demo host ever changes, update both the bucket CORS policy and
  `trustedOrigins`.
