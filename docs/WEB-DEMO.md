# Web demo — shipping the Expo build as a shareable link

> **Live:** https://crewmarket-demo.vercel.app (deployed 2026-10-01 via the recipe
> below; Vercel project `crewmarket-demo`, git auto-deploy deliberately disconnected —
> redeploys are CLI-only, re-export then `vercel deploy --prod` from `apps/mobile/dist`).

Branch `web-parity`. This is the mobile app running in a browser (react-native-web
via `expo export --platform web`) so the client can click through Slices 1–5 without
Expo Go. It is a **demo surface**, not a launch — see limitations at the bottom.

## The one thing that makes or breaks it: same-origin

Run raw, the web build is dead on arrival. The browser calls the API cross-origin
(the static site's host ≠ the API host), so **every** fetch is CORS-blocked, and
better-auth rejects the request Origin. The board won't even load.

The fix is to serve the web bundle and the API **on the same origin from the
browser's point of view**, via a rewrite that proxies `/api/*` to the real API.
Then fetches are same-origin and cookies just work. (Verified locally with a proxy;
the whole audit below ran through it.)

## Fastest shareable link (Vercel static site + rewrite)

The API already lives at `https://crewmarket-web.vercel.app` (test mode). Stand the
web bundle up as a **second** Vercel project that proxies its own `/api/*` to it.

1. **Build the bundle**, pointing it at its own origin (relative same-origin):

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_API_URL=https://<DEMO_HOST> npx expo export --platform web --output-dir dist
   ```

   Use the final demo hostname for `<DEMO_HOST>` (e.g. `crewmarket-demo.vercel.app`).
   All API/auth calls then go to `<DEMO_HOST>/api/*`, which the rewrite forwards.

   > ⚠️ **INCIDENT 10/8/2026 — never bake the audit-proxy URL.** The 10/1 deploy was
   > exported with `EXPO_PUBLIC_API_URL=http://localhost:9100` (the local audit proxy),
   > so every visitor's browser called *their own* localhost: board unreachable,
   > session check and sign-in dead — for everyone except the builder's machine while
   > the proxy ran, which is why the 10/1 "verified" pass missed it. Verify the bake
   > before deploying: `grep -ro 'localhost:9100\|localhost:3000' dist/_expo` must
   > come back empty, and the only host in the bundle must be `<DEMO_HOST>`.

2. **Add `apps/mobile/dist/vercel.json`** so the static host proxies the API and
   serves the SPA:

   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://crewmarket-web.vercel.app/api/:path*" }
     ]
   }
   ```

   **Also add `apps/mobile/dist/.vercelignore`** containing exactly:

   ```
   !assets/**
   ```

   Without it, Vercel CLI silently skips every font (the exported paths contain
   `node_modules` segments — `assets/__node_modules/.pnpm/...` — which the CLI's
   default ignore drops), and the deployed app 404s all four families (second half
   of the 10/8 incident; fonts had been broken on the live demo since 10/1).

   `expo export` **wipes `dist/`** — `vercel.json`, `.vercelignore`, and the
   `.vercel/` project link must be restored after every re-export, before deploying.

3. **Deploy the static folder** (new Vercel project, root = `apps/mobile/dist`,
   framework preset = "Other", no build step):

   ```bash
   cd apps/mobile/dist && vercel deploy --prod
   ```

   After deploying, smoke-test from a clean browser (not just curl — curl ignores
   CORS and doesn't execute the bundle): the board must render crew rows, and
   `https://<DEMO_HOST>/assets/.../Oswald_700Bold.<hash>.ttf` must return 200.

4. **Trust the demo origin** — the one required backend change. In
   `apps/web/lib/auth.ts`, add the demo host to `trustedOrigins` and redeploy the
   API (push to main auto-deploys):

   ```ts
   trustedOrigins: [
     // …existing…
     "https://<DEMO_HOST>", // DEV/DEMO ONLY — web-parity demo, remove before launch
   ],
   ```

   Without this, sign-in/booking POSTs come back `Invalid origin`. Board browsing
   (public GET) works without it, so if auth 403s, this is why.

That's the link. Alternative for a quick screen-share without deploying: run the
local stack + the audit proxy in `scratchpad/driver/proxy.mjs` and expose `:9100`
through a tunnel (`cloudflared tunnel --url http://localhost:9100`). Fine for a live
walkthrough, but it dies when the builder's machine sleeps — the Vercel path is the
real shareable link.

## Env vars / keys that must be set for the deploy

Everything is **test mode** — no real charges. The API host (`crewmarket-web`
project) already carries these from the existing deploy; the demo build only needs
`EXPO_PUBLIC_API_URL` at export time.

| Where | Var | Note |
|---|---|---|
| Export (build) | `EXPO_PUBLIC_API_URL=https://<DEMO_HOST>` | Baked into the bundle. Wrong value = CORS/blank board. |
| API (existing) | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Test keys. Already set. |
| API (existing) | `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhook is the payment source of truth; already registered for the Vercel host. |
| API (existing) | `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL*` (Neon) | Already set. |
| API (code) | `trustedOrigins += <DEMO_HOST>` | The one change above. |

Demo accounts (Neon): boat `boat@example.com` / `demo-boat-pass-1`, crew
`mate@example.com` / `demo-crew-pass-1` (drives "Del Pinder"). Pay with Stripe test
card `4242 4242 4242 4242` (any future expiry / CVC).

## Known web limitations to mention to the client

- **Stripe Checkout opens in a new browser tab** (not an in-app sheet like the
  phone). After paying, the client closes that tab and returns; the booking flips to
  "funds held" within a couple of seconds (webhook-confirmed). This is normal web
  behavior, and it's popup-blocker-safe.
- **Bookings list has no pull-to-refresh on web** (it's a touch gesture). The list
  refreshes when you navigate back to it, so it's not a dead end — just no
  swipe-down.
- **Date picker is the browser's native date field**, not the iOS wheel. Same
  result, different look.
- **It's the phone UI in a browser.** Single-column, phone-shaped layout even on a
  wide desktop window — that's expected; it's the mobile app, not a redesigned web
  app. Looks right at both desktop and phone widths.
- **Test mode throughout** — no real money moves.

## What was verified

Desktop (1280px) and phone (390px) widths, every flow clicked through end-to-end on
web: board + filters, sign-up/sign-in/sign-out/session-persist, crew profile + D-2,
booking request (quote math, multi-day, P&I gate, submit → ledger), accept/decline,
boat pay → real Stripe test Checkout → funds-held, credentials list/view/remove, and
upload (against local MinIO). Native iOS bundle re-exported clean — mobile behavior
is unchanged (platform files only diverge on web).

**10/7/2026 update — credential uploads now persist on the hosted demo.** The
deployed API is on the real Cloudflare R2 bucket per `docs/STORAGE-SWAP.md`
(bucket + scoped token + CORS all live). Scripted verification against production:
presign → browser-style PUT (CORS preflight 204 from both demo origins) → confirm →
self-reported row → presigned View → Remove; object unreachable without the
presigned signature (V-2). Synthetic docs only, as always.
