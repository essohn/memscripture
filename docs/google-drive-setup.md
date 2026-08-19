# Google Drive sync — GCP project setup

The Drive sync feature needs an OAuth 2.0 client ID owned by a Google
Cloud project. This is a one-time maintainer task. The resulting
client ID is public (it ships to the browser) — safe to commit to a
`.env` file that is loaded into Cloudflare Pages env vars, but **do
not** confuse this with a client *secret* (we never use one).

## 1. Create a Google Cloud project

1. Open https://console.cloud.google.com/projectcreate
2. Project name: `memscripture-prod` (or similar). No organization required.

## 2. Enable the Drive API

1. APIs & Services → Library
2. Search "Google Drive API" → Enable.

## 3. Configure the OAuth consent screen

1. APIs & Services → OAuth consent screen
2. User type: **External**.
3. Publishing status: **publish the app**. It starts as "Testing", where only
   accounts added under "Test users" can sign in at all — everyone else is
   turned away with "Google에서 인증하지 않은 앱", which reads like a fault in
   the app but is only the consent screen refusing a stranger. Testing also
   caps at 100 test users, each added by email by hand.

   Publishing needs **no verification review here**, because all three scopes
   below are non-sensitive. Verification is what sensitive and restricted
   scopes require — `drive`, `drive.readonly` and the like — and this app asks
   for none of them. Press "APP 게시" and sign-in works for anyone.
4. App info: app name = "MemScripture", user support email = your email.
5. Scopes: add **all three**
   - `https://www.googleapis.com/auth/drive.appdata` — the sync file lives in
     the hidden per-app `appDataFolder` space (`drive.ts`), and that space has
     its own scope. `drive.file` does not reach it: omit this and every Drive
     call 403s, including the very first upload.
   - `https://www.googleapis.com/auth/drive.file` — the file operations.
   - `https://www.googleapis.com/auth/userinfo.email` — `connectGoogleDrive`
     calls the UserInfo endpoint to show which account is connected, and that
     endpoint rejects a token carrying no identity scope. Omit it and connect
     fails with `userinfo failed: HTTP 401` before any Drive call.

   All three are non-sensitive, so none triggers app verification. Do **not**
   add `drive` or `drive.readonly` — those do.

   Changing this list later means every already-connected device must
   disconnect and reconnect: Google issues a token for the scopes granted at
   consent time, and the stored token is not retroactively widened.
5. Test users: add the email(s) you'll sign in with.

## 4. Create the OAuth client ID

1. APIs & Services → Credentials → Create credentials → OAuth client ID
2. Application type: **Web application**
3. Authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `http://localhost:4173` (preview)
   - `https://mem.lifescripture.org` (prod, the custom domain in `wrangler.jsonc`)
   - `https://memscripture.<your-subdomain>.workers.dev` — only if you sign in
     on the workers.dev URL too. `wrangler.jsonc` sets `workers_dev: true`, so
     that origin is live and GIS rejects any origin not on this list.
4. Authorized redirect URIs: leave empty — GIS uses the implicit token flow, no redirect needed.
5. Create → copy the client ID (looks like `123…apps.googleusercontent.com`).

Note on preview deployments: `preview_urls: true` mints a fresh per-version
hostname on every deploy. Those origins can't be pre-registered, so Drive
sync will not authenticate from a preview URL. Test on localhost or prod.

## 5. Wire the env var

Local dev:

```bash
echo "PUBLIC_GOOGLE_OAUTH_CLIENT_ID=YOUR_ID.apps.googleusercontent.com" >> .env
```

Production — this deploys as a Cloudflare **Worker**, not Pages (`wrangler.jsonc`
declares `main` + `assets` + a custom-domain route). Commit the ID to
`wrangler.jsonc` so the config travels with the code:

```jsonc
{
  "name": "memscripture",
  // …
  "vars": {
    "PUBLIC_GOOGLE_OAUTH_CLIENT_ID": "YOUR_ID.apps.googleusercontent.com"
  }
}
```

This is a client ID, **not** a client secret — it ships to every browser that
loads the app, so committing it leaks nothing. Never put an OAuth *secret*
here; this flow doesn't use one.

Changing the value then means commit + deploy. The alternative is Workers &
Pages → memscripture → Settings → Variables and Secrets (plaintext, not
Secret — secrets are write-only in the UI and this value isn't one), which
avoids a redeploy but leaves the setting untracked. Note that a dashboard
variable and a `vars` entry with the same name collide: the deployed
`wrangler.jsonc` wins and silently overwrites the dashboard value, so pick one.

The value is read at **runtime**, not baked in at build time: `clientId.ts` uses
`$env/dynamic/public`, and the worker serves `/_app/env.js` from the Workers env
on each request (`server.init({ env })` in the generated `_worker.js`). So
changing the variable takes effect without rebuilding the static assets — and
conversely, setting it only in the build environment does nothing.

## 6. Smoke-test

1. Open the app, navigate to `/settings`.
2. Tap "Google Drive 연결". The GIS consent screen should open in a popup; pick your test account; consent to `drive.file`.
3. After connect, tap "지금 동기화". First run uploads. Edit something locally, sync again — toast should say "Drive로 올렸어요".
4. On a second device, connect with the same account → "지금 동기화" → confirm overwrite → local state matches.

## Troubleshooting

- **"Error 400: redirect_uri_mismatch"** → you missed adding the local
  origin to step 4. GIS uses `postMessage` to the origin; it must be
  in the allowlist.
- **"Google에서 인증하지 않은 앱" / sign-in refused** → the consent screen is
  still in "Testing", where only listed test users may sign in. This is the
  one to expect on a second device signed into a different Google account.
  Fix it by publishing the app (step 3); no review is involved, since every
  scope here is non-sensitive. Adding the account under "Test users" also
  works, but only for that account and only up to 100 of them.
- **Popup blocked** → first-time browser sessions may block; allow
  popups for the app origin and retry.
