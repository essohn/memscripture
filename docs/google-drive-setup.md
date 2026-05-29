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
2. User type: **External**. Publishing status starts as "Testing" — that's fine for the maintainer's account; production verification is not required as long as the scope stays at `drive.file` (least-privilege, doesn't require Google verification).
3. App info: app name = "MemScripture", user support email = your email.
4. Scopes: add `https://www.googleapis.com/auth/drive.file`. Do **not** add `drive` or `drive.readonly` — those require app verification.
5. Test users: add the email(s) you'll sign in with.

## 4. Create the OAuth client ID

1. APIs & Services → Credentials → Create credentials → OAuth client ID
2. Application type: **Web application**
3. Authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `http://localhost:4173` (preview)
   - `https://mem.lifescripture.org` (prod)
4. Authorized redirect URIs: leave empty — GIS uses the implicit token flow, no redirect needed.
5. Create → copy the client ID (looks like `123…apps.googleusercontent.com`).

## 5. Wire the env var

Local dev:

```bash
echo "PUBLIC_GOOGLE_OAUTH_CLIENT_ID=YOUR_ID.apps.googleusercontent.com" >> .env
```

Production (Cloudflare Pages):

1. Pages → memscripture → Settings → Environment variables
2. Add `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` for both Production and Preview environments.
3. Redeploy.

## 6. Smoke-test

1. Open the app, navigate to `/settings`.
2. Tap "Google Drive 연결". The GIS consent screen should open in a popup; pick your test account; consent to `drive.file`.
3. After connect, tap "지금 동기화". First run uploads. Edit something locally, sync again — toast should say "Drive로 올렸어요".
4. On a second device, connect with the same account → "지금 동기화" → confirm overwrite → local state matches.

## Troubleshooting

- **"Error 400: redirect_uri_mismatch"** → you missed adding the local
  origin to step 4. GIS uses `postMessage` to the origin; it must be
  in the allowlist.
- **"This app isn't verified" warning** → expected on Testing
  publishing status; click "Advanced" → "Go to MemScripture (unsafe)"
  for test users.
- **Popup blocked** → first-time browser sessions may block; allow
  popups for the app origin and retry.
