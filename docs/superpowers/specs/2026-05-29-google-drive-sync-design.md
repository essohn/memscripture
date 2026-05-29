# Google Drive Sync — Design

**Status:** Approved (2026-05-29) · single-phase delivery.

## Problem

All user-generated data in MemScripture (OYO verses, bookmarks, SRS
progress, daily activity, settings) lives in IndexedDB. There is no
cross-device option and no off-device backup beyond the manual
JSON download added in commit `34ecd2d`. Losing the device or
clearing the browser wipes everything.

This spec adds **opt-in Google Drive sync** so a user can manually
push their full local dataset to a private cloud file and pull it
down on a fresh device.

## Non-Goals

- **iCloud / CloudKit.** Not feasible from a PWA: iCloud Drive has no
  public web SDK and CloudKit requires a native iOS app shell. Adding
  iCloud later means wrapping the PWA in Capacitor / equivalent.
- **Multi-cloud (Dropbox, OneDrive, etc.)** for now. Drive only.
- **Real-time / background sync.** Manual button only.
- **Conflict-free distributed sync (CRDTs, operation logs, deltas).**
  Last-writer-wins on a full-file snapshot is the model.
- **Multi-user authorization.** A given install is bound to one
  Google account; switching accounts means disconnect → reconnect.
- **Encryption beyond what Drive provides at rest.** App data folder
  is private to the app's OAuth client.

## Recommended Approach

A user clicks "Drive에 저장" or "Drive에서 받기" in Settings. The app
serializes every user-owned IndexedDB row into one JSON envelope and
uploads it to (or downloads it from) a single file in Drive's
**`appDataFolder` space** — a private folder that doesn't appear in
the user's normal Drive UI and is only accessible by the OAuth
client that wrote it.

Conflict resolution is last-writer-wins by `lastModifiedAt`. The
flow always confirms before doing anything destructive and keeps a
one-shot local snapshot for "undo last sync".

## Architecture

### Data scope (what gets synced)

| Table | Scope | Reason |
|---|---|---|
| `verses` | only `package_id === 'oyo'` | user content |
| `bookmarks` | all rows | user content |
| `progress` | all rows | SRS state per verse |
| `activity` | all rows | daily activity log |
| `settings` | all rows | Eye toggle + (later) view options |
| `packages` | only `kind === 'user'` | OYO PackageMeta (name + verse_number) |

**Excluded:** built-in curated packages and their verses
(`kind === 'builtin'`). They reinstall idempotently from
`/data/*_krv.json` on any device, so syncing them would waste bytes
and complicate restore on a fresh device that hasn't run
`listPackages` yet.

### Snapshot envelope

```jsonc
{
	"version": 1,
	"exportedAt": "2026-05-29T22:30:00Z",
	"lastModifiedAt": "2026-05-29T22:30:00Z",
	"device": "an opaque id minted on first sync (UUID)",
	"oyo": {
		"package": { /* the OYO packages row, kind='user' */ },
		"verses": [ /* OYO StoredVerses, package_id stripped */ ]
	},
	"bookmarks": [ /* all bookmark rows */ ],
	"progress": [ /* all VerseProgress rows */ ],
	"activity": [ /* all DailyActivity rows */ ],
	"settings": [ /* all StoredSetting rows */ ]
}
```

- `version: 1` is a single integer; future readers branch on it.
- `lastModifiedAt` is the **canonical timestamp** used for the
  last-writer-wins decision. Bumped to `new Date().toISOString()`
  every time the user performs a mutation (CRUD, toggle, etc.) — see
  "Tracking lastModifiedAt" below.
- `device` is a UUID minted once in `settings` on first sync; only
  used for telemetry/debugging in toast messages ("이 기기에서 마지막
  동기화").

### Auth — Google Identity Services + PKCE

- **Library:** Google Identity Services (GIS) via the
  `accounts.google.com/gsi/client` script tag. No Drive SDK
  dependency — we hit the REST API directly.
- **Flow:** `google.accounts.oauth2.initTokenClient` with
  `prompt: 'consent'` on first connect, `''` on subsequent silent
  refresh. PKCE happens client-side inside GIS.
- **Scope:** `https://www.googleapis.com/auth/drive.file` — the
  *least-privilege* scope; the app can only see / modify files it
  itself created. Critically, it lets us create and access files in
  `appDataFolder` without ever touching the user's real Drive
  content.
- **Token storage:** access token + expiry timestamp + the
  authenticated email kept in `db.settings` under
  `google_drive_auth`. Tokens are short-lived (~1 hr); GIS handles
  silent refresh via the cached client.
- **Disconnect:** clear `google_drive_auth` from `db.settings`.
  Optionally revoke via `google.accounts.oauth2.revoke()` but not
  strictly required.

### Drive REST surface

Three calls total, all `https://www.googleapis.com/drive/v3/...`
with `Authorization: Bearer <token>`:

1. **Find:** `GET /files?spaces=appDataFolder&q=name='memscripture-sync.json'`
   → returns `[{ id, modifiedTime }]` or empty.
2. **Download:** `GET /files/{id}?alt=media` → JSON body.
3. **Upload:**
   - First-time: `POST /upload/files?uploadType=multipart` with
     `parents: ['appDataFolder']`.
   - Update: `PATCH /upload/files/{id}?uploadType=media`.

Atomic from the Drive side — partial uploads result in HTTP errors,
not partial files.

### Sync flow

User taps "동기화" in Settings. The orchestrator:

```
1. Are we authenticated? If not, prompt connect first.
2. Find remote file. If none:
     a. Build local snapshot.
     b. Upload as create.
     c. Toast: "Drive에 처음 저장했어요"
     d. STOP.
3. Download remote snapshot.
4. Compare local.lastModifiedAt vs remote.lastModifiedAt:
     a. Equal → "이미 최신 상태예요" → STOP.
     b. local > remote → upload local → "Drive로 올렸어요" → STOP.
     c. remote > local → CONFIRM: "Drive에 더 최신 데이터가 있어요.
        가져오면 로컬 변경사항이 덮어쓰여집니다. 진행할까요?"
        → if YES:
             i.   Save current local state to db.settings under
                  'pre_sync_backup' (one slot, overwrites previous).
             ii.  Apply snapshot to Dexie (clear scope, insert from
                  envelope).
             iii. Toast with "되돌리기" action that restores
                  pre_sync_backup.
           → if NO: STOP.
5. Update settings.lastSyncAt and the auth row's email/expiry as
   needed.
```

### Tracking `lastModifiedAt`

Each user-mutating helper (createOyoVerse, deleteOyoVerse,
setBookmark, clearBookmark, setShowVerseTextInList, etc.) bumps a
single `data_last_modified_at` settings key. The sync orchestrator
reads this key as `local.lastModifiedAt`. A tiny utility wraps the
bump:

```ts
// src/lib/db/touchData.ts
export async function touchDataModified() {
  await db.settings.put({
    key: 'data_last_modified_at',
    value: new Date().toISOString()
  });
}
```

Wire it into every mutating CRUD path. Minor write-amplification
(one extra Dexie put per user action) but trivial cost.

### Pre-sync backup

Before importing a remote snapshot that overwrites local, we save
the current local snapshot to `db.settings` under
`pre_sync_backup`. The "되돌리기" affordance in the sync toast
re-applies it. Only one slot — a second sync overwrites the
previous backup. Acceptable for a single-step undo.

### UI

In `/settings`:

- **클라우드 동기화** section, new at top of the (currently empty)
  page.
- If not authenticated:
  - State line: "Drive와 연결되지 않음"
  - Primary button: "Google Drive 연결"
- If authenticated:
  - State line: "연결됨 · user@gmail.com"
  - Primary button: "지금 동기화" (large)
  - Secondary: "마지막 동기화: 2시간 전" or "아직 동기화 안 함"
  - Tertiary: "직전 동기화 되돌리기" (visible only if
    pre_sync_backup exists, and only for ~24 hr after the import)
  - Destructive (small, near bottom): "Drive 연결 해제"

The OYO page's existing Download/Upload buttons stay — they remain
the offline / file-based path.

### Edge cases

- **First sync on a fresh device with existing remote:** local
  scope tables are empty, remote has data. The flow falls into
  "remote > local" path (anything > nothing), confirm, import. No
  pre_sync_backup created on first import because there's nothing
  to undo to.
- **Token expired mid-sync:** REST call returns 401. Catch, run GIS
  silent refresh, retry once. If refresh fails (consent revoked),
  prompt the user to reconnect.
- **Network failure during upload:** Drive returns non-2xx, no
  remote mutation. Toast the error, leave local state intact.
- **Concurrent edits across two devices (the canonical lost-update
  hazard):** acknowledged limitation of last-writer-wins. The
  pre_sync_backup + visible "되돌리기" affordance is the user-facing
  mitigation. If this becomes a real pain, revisit with deltas.

## Risks

- **GIS popup blocking** in some browsers / iOS Safari PWA standalone
  mode. Use the redirect flow as a fallback only if the popup flow
  surfaces real issues during testing.
- **OAuth client ID is bound to a single Google Cloud project** —
  someone has to own that GCP project. For this app it's the
  maintainer; the client ID lives in `.env` as
  `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` and is shipped to the client.
  It is a public identifier — not a secret.
- **Drive `drive.file` scope is per-OAuth-client.** Changing the
  client ID later loses access to previously-created files. Not a
  problem for the maintainer's project, but worth noting.
- **Server-side schema migration is not possible** — every device
  must understand the same envelope version. Phase-up plan when
  envelope changes: bump `version`, and the client reads the version
  before applying; old envelopes can be migrated in JS on the way in.

## Phase 1 covers

1. Google Cloud Console project + OAuth client + Drive API enable
   (manual maintainer task, captured in a README in this doc set).
2. `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` env wiring (vite / SvelteKit).
3. `src/lib/cloud/google.ts` — GIS script loader, connect /
   disconnect, get-token-with-refresh.
4. `src/lib/cloud/drive.ts` — find / download / upload helpers for
   the single appDataFolder file.
5. `src/lib/sync/snapshot.ts` — build / apply snapshot across the
   six tables listed in "Data scope".
6. `src/lib/sync/syncFlow.ts` — orchestrate the decision tree
   above; returns a result the UI surfaces as a toast.
7. `src/lib/db/touchData.ts` — `touchDataModified()` helper, wired
   into every mutating path: OYO CRUD, bookmark setters,
   `setShowVerseTextInList`, future SRS writers.
8. `src/routes/settings/+page.svelte` — the new section.
9. Pre-sync backup save / restore via a `pre_sync_backup` setting.
10. Unit tests for: snapshot round-trip, sync decision matrix (all
    four branches), `touchDataModified` integration, pre_sync_backup
    apply.
11. Manual integration test (OAuth can't be fully automated): connect,
    sync, edit on second device, sync, verify.
