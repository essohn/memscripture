# Google Drive Sync — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship manual full-snapshot Google Drive sync — every user-owned Dexie row serializes into one JSON envelope, uploads to / downloads from a private `appDataFolder` file, and resolves conflicts via last-writer-wins with a one-shot undo.

**Architecture:** Six layers, each in its own module: a `touchDataModified()` helper writes a `data_last_modified_at` settings key on every user mutation; `snapshot.ts` serializes/deserializes the six in-scope tables into a versioned envelope; `preSyncBackup.ts` stores/restores the last local state to a single `pre_sync_backup` settings slot; `google.ts` wraps Google Identity Services for connect/token-refresh/disconnect; `drive.ts` calls the three Drive REST endpoints (find / download / upload); `syncFlow.ts` orchestrates the decision tree the user triggers from `/settings`.

**Tech Stack:** Svelte 5 (runes), SvelteKit, Tailwind v4, Dexie 4 + fake-indexeddb, Vitest + @testing-library/svelte, Playwright, Google Identity Services (script tag, no SDK), Drive v3 REST API (fetch).

**Convention notes:** Conventional commits (`feat`, `fix`, `refactor`, `test`). Korean UI strings. Commit trailer always: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Direct-to-main commit pattern (project convention).

---

## File Structure

**Create:**
- `src/lib/db/touchData.ts` — `touchDataModified()` + `getDataLastModified()`
- `src/lib/sync/snapshot.ts` — `buildSyncSnapshot()`, `applySyncSnapshot()`, `SyncSnapshot` type
- `src/lib/sync/preSyncBackup.ts` — save / load / clear pre-sync backup
- `src/lib/cloud/google.ts` — GIS script loader, connect, refresh, disconnect, `GoogleAuthState`
- `src/lib/cloud/drive.ts` — `findSyncFile()`, `downloadSyncFile()`, `uploadSyncFile()`
- `src/lib/sync/syncFlow.ts` — `performSync()` + `SyncResult` union + `SyncHandlers`
- `src/lib/sync/clientId.ts` — reads `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` from env
- `tests/unit/touchData.test.ts`
- `tests/unit/snapshot.test.ts`
- `tests/unit/preSyncBackup.test.ts`
- `tests/unit/drive.test.ts`
- `tests/unit/syncFlow.test.ts`
- `docs/superpowers/specs/2026-05-29-google-drive-sync-design.md` already exists — no changes
- `docs/google-drive-setup.md` — maintainer setup guide for GCP project

**Modify:**
- `.env.example` — add `PUBLIC_GOOGLE_OAUTH_CLIENT_ID=`
- `src/lib/db/oyo.ts` — call `touchDataModified()` from create/update/delete/restore
- `src/lib/db/bookmarks.ts` — call `touchDataModified()` from `setBookmark` / `clearBookmark` / `clearAllOfColor`
- `src/lib/db/viewOptions.ts` — call `touchDataModified()` from `setShowVerseTextInList`
- `src/routes/settings/+page.svelte` — replace placeholder with the sync section

**Test harness conventions:**
- Dexie tests use `import 'fake-indexeddb/auto'` and `await db.delete(); await db.open();` in `beforeEach`.
- google.ts tests stub `window.google.accounts.oauth2` via `vi.stubGlobal`.
- drive.ts tests stub `globalThis.fetch` via `vi.stubGlobal`.
- syncFlow.ts tests mock the imported `./snapshot`, `./preSyncBackup`, `../cloud/google`, `../cloud/drive` modules via `vi.mock`.

---

## Task 1: Client ID env wiring

**Files:**
- Create: `src/lib/sync/clientId.ts`
- Create: `.env.example`
- Test: covered indirectly by Task 5 (google.ts) tests via `vi.mock`

- [ ] **Step 1: Add `.env.example`**

Create `.env.example` at the repo root:

```
# Public Google OAuth 2.0 client ID for the Drive sync feature.
# Create one at https://console.cloud.google.com/apis/credentials with type
# "Web application" and origin = your deployed URL. Public — safe to ship to
# clients. Empty value disables the Drive sync UI.
PUBLIC_GOOGLE_OAUTH_CLIENT_ID=
```

- [ ] **Step 2: Implement `src/lib/sync/clientId.ts`**

Create the file:

```ts
import { env } from '$env/dynamic/public';

/**
 * Returns the Google OAuth client ID configured for this deployment, or
 * null when unset. Callers should treat null as "Drive sync disabled" and
 * hide the affordance.
 */
export function getGoogleOauthClientId(): string | null {
	const id = env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
	if (!id || id.length === 0) return null;
	return id;
}
```

(`$env/dynamic/public` is SvelteKit's runtime accessor; reads from `import.meta.env.PUBLIC_*` and exposes only `PUBLIC_`-prefixed vars to the client.)

- [ ] **Step 3: Confirm the build still passes**

```bash
npm run build 2>&1 | tail -8
```

Expected: "✓ built in …s" and no TypeScript errors. The new module is referenced nowhere yet but should compile.

- [ ] **Step 4: Commit**

```bash
git add .env.example src/lib/sync/clientId.ts
git commit -m "$(cat <<'EOF'
chore(sync): scaffold PUBLIC_GOOGLE_OAUTH_CLIENT_ID env access

Adds .env.example + a getGoogleOauthClientId() reader that returns
null when unset so callers can gracefully hide the Drive sync UI on
deployments without an OAuth client configured.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `touchDataModified()` helper + wire into existing mutators

**Files:**
- Create: `src/lib/db/touchData.ts`
- Modify: `src/lib/db/oyo.ts` (createOyoVerse, updateOyoVerse, deleteOyoVerse, restoreOyoVerse)
- Modify: `src/lib/db/bookmarks.ts` (setBookmark, clearBookmark, clearAllOfColor)
- Modify: `src/lib/db/viewOptions.ts` (setShowVerseTextInList)
- Test: `tests/unit/touchData.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/touchData.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getDataLastModified,
	touchDataModified
} from '../../src/lib/db/touchData';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('touchDataModified', () => {
	it('returns null when never touched', async () => {
		expect(await getDataLastModified()).toBeNull();
	});

	it('writes an ISO timestamp on touch', async () => {
		await touchDataModified();
		const v = await getDataLastModified();
		expect(typeof v).toBe('string');
		expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('overwrites the previous timestamp on each touch', async () => {
		await touchDataModified();
		const first = await getDataLastModified();
		await new Promise((r) => setTimeout(r, 5));
		await touchDataModified();
		const second = await getDataLastModified();
		expect(second).not.toBe(first);
		expect(second!.localeCompare(first!)).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/touchData.test.ts
```

Expected: all three fail with "Cannot find module touchData".

- [ ] **Step 3: Implement `touchData.ts`**

Create `src/lib/db/touchData.ts`:

```ts
import { db } from './local';

const KEY = 'data_last_modified_at';

/** Stamps the current ISO timestamp as the local last-write marker.
 *  Read by the sync orchestrator to decide between local and remote
 *  in last-writer-wins. Called from every user-mutating Dexie path. */
export async function touchDataModified(): Promise<void> {
	await db.settings.put({ key: KEY, value: new Date().toISOString() });
}

/** Returns the most recent local last-write timestamp, or null when the
 *  user has never made a mutation on this device. */
export async function getDataLastModified(): Promise<string | null> {
	const row = await db.settings.get(KEY);
	const v = row?.value;
	return typeof v === 'string' ? v : null;
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/touchData.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Wire into `src/lib/db/oyo.ts`**

The file currently has `createOyoVerse`, `updateOyoVerse`, `deleteOyoVerse`, `restoreOyoVerse`, each calling `syncOyoVerseCount()` after the mutation. Add `await touchDataModified();` immediately after the existing `await db.verses.put(...)` / `await db.verses.delete(...)` / `await syncOyoVerseCount();` calls — at the *end* of each function's mutation sequence so a write failure doesn't bump the timestamp.

Add the import at the top of the file alongside the existing imports:

```ts
import { touchDataModified } from './touchData';
```

Then in each function add `await touchDataModified();` as the last awaited call before `return`. For `createOyoVerse` (which returns the row), put it before the `return row` line:

```ts
export async function createOyoVerse(input: OyoVerseInput): Promise<StoredVerse> {
	const no = await nextVerseNo();
	const row: StoredVerse = { /* ... unchanged ... */ };
	await db.verses.put(row);
	await syncOyoVerseCount();
	await touchDataModified();
	return row;
}
```

Same pattern for `updateOyoVerse` (place after the put), `deleteOyoVerse` (after `syncOyoVerseCount`, before `return row`), `restoreOyoVerse` (after `syncOyoVerseCount`).

For `deleteOyoVerse`, place the touch only when a row was actually deleted (skip when the early `if (!row) return null;` fires):

```ts
export async function deleteOyoVerse(verseNo: number): Promise<StoredVerse | null> {
	const row = await db.verses.get([OYO_PACKAGE_ID, verseNo]);
	if (!row) return null;
	await db.verses.delete([OYO_PACKAGE_ID, verseNo]);
	await syncOyoVerseCount();
	await touchDataModified();
	return row;
}
```

`updateOyoVerse` also has an early-return when the row is missing — guard the same way:

```ts
export async function updateOyoVerse(
	verseNo: number,
	patch: Partial<OyoVerseInput>
): Promise<void> {
	const row = await db.verses.get([OYO_PACKAGE_ID, verseNo]);
	if (!row) return;
	await db.verses.put({ ...row, ...patch });
	await touchDataModified();
}
```

`restoreOyoVerse` similarly guards on the package_id check:

```ts
export async function restoreOyoVerse(verse: StoredVerse): Promise<void> {
	if (verse.package_id !== OYO_PACKAGE_ID) return;
	await db.verses.put(verse);
	await syncOyoVerseCount();
	await touchDataModified();
}
```

- [ ] **Step 6: Wire into `src/lib/db/bookmarks.ts`**

Add the import:

```ts
import { touchDataModified } from './touchData';
```

Find each of `setBookmark`, `clearBookmark`, `clearAllOfColor`. Add `await touchDataModified();` as the last awaited call before each function returns. If a function has an early-return path (e.g. `clearBookmark` early-returning when no row exists), skip the touch on that path.

Read the file first so you know the exact existing structure, then add the calls.

- [ ] **Step 7: Wire into `src/lib/db/viewOptions.ts`**

Add the import:

```ts
import { touchDataModified } from './touchData';
```

In `setShowVerseTextInList`, after the existing Dexie write, add `await touchDataModified();`. The file uses a write queue (`writeQueue = next.catch(() => {})`) — call `touchDataModified()` inside the `then` callback, after the Dexie put succeeds, so a write failure doesn't stamp a misleading timestamp:

```ts
export async function setShowVerseTextInList(v: boolean): Promise<void> {
	const next = writeQueue.then(async () => {
		const raw = await readRaw();
		await db.settings.put({ key: KEY, value: { ...raw, showVerseTextInList: v } });
		await touchDataModified();
	});
	writeQueue = next.catch(() => {});
	return next;
}
```

- [ ] **Step 8: Run the full unit suite to confirm nothing broke**

```bash
npm test
```

Expected: previous count + 3 = 268 passing. (Was 265 after the most recent commit — confirm baseline first if uncertain.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/touchData.ts src/lib/db/oyo.ts src/lib/db/bookmarks.ts src/lib/db/viewOptions.ts tests/unit/touchData.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): track data_last_modified_at across every user mutation

Adds a single settings row that the sync orchestrator reads as the
local "last write" timestamp. Bumped from every OYO CRUD path, every
bookmark setter, and the Eye toggle persister. Always called after
the underlying Dexie write succeeds so a failed mutation doesn't
poison the timestamp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Snapshot build / apply

**Files:**
- Create: `src/lib/sync/snapshot.ts`
- Test: `tests/unit/snapshot.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/snapshot.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	createOyoVerse,
	OYO_PACKAGE_ID,
	seedOyoPackageIfMissing
} from '../../src/lib/db/oyo';
import { setBookmark } from '../../src/lib/db/bookmarks';
import { setShowVerseTextInList } from '../../src/lib/db/viewOptions';
import { touchDataModified } from '../../src/lib/db/touchData';
import { applySyncSnapshot, buildSyncSnapshot } from '../../src/lib/sync/snapshot';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await seedOyoPackageIfMissing();
});

describe('buildSyncSnapshot', () => {
	it('returns a v1 envelope with empty arrays when nothing has been written', async () => {
		const snap = await buildSyncSnapshot();
		expect(snap.version).toBe(1);
		expect(typeof snap.exportedAt).toBe('string');
		expect(snap.lastModifiedAt).toBe(''); // nothing touched yet
		expect(typeof snap.device).toBe('string');
		expect(snap.device.length).toBeGreaterThan(0);
		expect(snap.oyo.verses).toEqual([]);
		expect(snap.bookmarks).toEqual([]);
		expect(snap.progress).toEqual([]);
		expect(snap.activity).toEqual([]);
		// settings should hold at least the device id we just minted
		expect(snap.settings.length).toBeGreaterThan(0);
	});

	it('includes OYO verses + bookmarks + lastModifiedAt timestamp', async () => {
		await createOyoVerse({ cite: '요한복음 3 : 16', title: '영생', w: '하나님이…' });
		await setBookmark('oyo', 1, 'red');
		await setShowVerseTextInList(false);

		const snap = await buildSyncSnapshot();
		expect(snap.oyo.verses).toHaveLength(1);
		expect(snap.oyo.verses[0].cite).toBe('요한복음 3 : 16');
		expect(snap.bookmarks).toHaveLength(1);
		expect(snap.bookmarks[0].color).toBe('red');
		expect(snap.lastModifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('excludes built-in packages and their verses', async () => {
		// Drop a fake curated package + verse alongside OYO
		await db.packages.put({
			id: 'builtin_x',
			name: 'Built-in',
			abbreviation: 'BX',
			verse_number: 1,
			translation: 'krv',
			translation_name: '개역',
			language: 'kor',
			copyright: '',
			copyright_text: '',
			version: 1,
			source: 'data/x.json',
			default: false,
			kind: 'builtin'
		});
		await db.verses.put({
			package_id: 'builtin_x',
			no: 1,
			i: 1,
			title: 't',
			cite: 'c',
			w: 'w'
		});

		await createOyoVerse({ cite: 'oyo cite', title: '', w: 'oyo body' });

		const snap = await buildSyncSnapshot();
		expect(snap.oyo.verses.every((v) => v.package_id === undefined || v.package_id === OYO_PACKAGE_ID)).toBe(true);
		expect(snap.oyo.package?.id).toBe(OYO_PACKAGE_ID);
		expect(snap.oyo.verses).toHaveLength(1);
	});
});

describe('applySyncSnapshot', () => {
	it('round-trips a snapshot: build, wipe, apply → state matches', async () => {
		await createOyoVerse({ cite: '요한복음 3 : 16', title: '영생', w: '하나님이…' });
		await createOyoVerse({ cite: '시편 23 : 1', title: '목자', w: '주는 나의 목자' });
		await setBookmark('oyo', 1, 'amber');
		await setShowVerseTextInList(false);
		await touchDataModified();

		const snap = await buildSyncSnapshot();

		// wipe & reseed
		await db.delete();
		await db.open();
		await seedOyoPackageIfMissing();

		await applySyncSnapshot(snap);

		const verses = await db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray();
		expect(verses).toHaveLength(2);
		expect(verses.find((v) => v.cite === '요한복음 3 : 16')?.title).toBe('영생');

		const bookmarks = await db.bookmarks.toArray();
		expect(bookmarks).toHaveLength(1);
		expect(bookmarks[0].color).toBe('amber');
	});

	it('clears in-scope state before applying (last-writer-wins semantics)', async () => {
		await createOyoVerse({ cite: 'stays', title: '', w: 'before' });
		const fresh = await buildSyncSnapshot();

		await createOyoVerse({ cite: 'will be wiped', title: '', w: 'discarded' });

		await applySyncSnapshot(fresh);

		const verses = await db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray();
		expect(verses).toHaveLength(1);
		expect(verses[0].cite).toBe('stays');
	});

	it('rejects unsupported versions', async () => {
		await expect(applySyncSnapshot({ version: 99 } as any)).rejects.toThrow(/version/);
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/snapshot.test.ts
```

Expected: all six fail with "Cannot find module '../../src/lib/sync/snapshot'".

- [ ] **Step 3: Implement `snapshot.ts`**

Create `src/lib/sync/snapshot.ts`:

```ts
import { db } from '$lib/db/local';
import { OYO_PACKAGE_ID } from '$lib/db/oyo';
import { getDataLastModified } from '$lib/db/touchData';
import type { Bookmark, DailyActivity, PackageMeta, VerseProgress } from '$lib/types';
import type { StoredSetting, StoredVerse } from '$lib/db/local';

const DEVICE_KEY = 'sync_device_id';

export interface SyncSnapshot {
	version: 1;
	exportedAt: string;
	lastModifiedAt: string;
	device: string;
	oyo: {
		package: PackageMeta | null;
		verses: StoredVerse[];
	};
	bookmarks: Bookmark[];
	progress: VerseProgress[];
	activity: DailyActivity[];
	settings: StoredSetting[];
}

/** Returns the device id stored in settings, creating one on first call.
 *  Used only for telemetry / toast strings — sync identity does not depend
 *  on this. */
async function getOrCreateDeviceId(): Promise<string> {
	const row = await db.settings.get(DEVICE_KEY);
	if (row && typeof row.value === 'string') return row.value;
	const id = (
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	await db.settings.put({ key: DEVICE_KEY, value: id });
	return id;
}

export async function buildSyncSnapshot(): Promise<SyncSnapshot> {
	const device = await getOrCreateDeviceId();
	const [oyoPkg, allVerses, bookmarks, progress, activity, settings] = await Promise.all([
		db.packages.get(OYO_PACKAGE_ID),
		db.verses.where('package_id').equals(OYO_PACKAGE_ID).toArray(),
		db.bookmarks.toArray(),
		db.progress.toArray(),
		db.activity.toArray(),
		db.settings.toArray()
	]);

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		lastModifiedAt: (await getDataLastModified()) ?? '',
		device,
		oyo: {
			package: oyoPkg ?? null,
			verses: allVerses
		},
		bookmarks,
		progress,
		activity,
		settings
	};
}

export async function applySyncSnapshot(input: SyncSnapshot): Promise<void> {
	if (!input || (input as { version?: unknown }).version !== 1) {
		throw new Error(`unsupported snapshot version: ${(input as { version?: unknown })?.version}`);
	}
	const snap = input as SyncSnapshot;

	// Clear in-scope rows. We intentionally leave built-in packages and their
	// verses alone; listPackages will repopulate them on first read.
	await db.bookmarks.clear();
	await db.progress.clear();
	await db.activity.clear();
	await db.settings.clear();
	await db.verses.where('package_id').equals(OYO_PACKAGE_ID).delete();

	// Restore. Order matters only for read paths that join — none here.
	if (snap.oyo.package) await db.packages.put(snap.oyo.package);
	if (snap.oyo.verses.length > 0) await db.verses.bulkPut(snap.oyo.verses);
	if (snap.bookmarks.length > 0) await db.bookmarks.bulkPut(snap.bookmarks);
	if (snap.progress.length > 0) await db.progress.bulkPut(snap.progress);
	if (snap.activity.length > 0) await db.activity.bulkPut(snap.activity);
	if (snap.settings.length > 0) await db.settings.bulkPut(snap.settings);
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/snapshot.test.ts
npm test
```

Expected: all 6 snapshot tests pass, full suite +6 from before.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/snapshot.ts tests/unit/snapshot.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): build + apply full-snapshot envelopes across Dexie

The envelope holds every user-owned table — OYO package + verses,
bookmarks, progress, activity, settings — and explicitly excludes
built-in packages/verses (those re-install on first listPackages).
applySyncSnapshot clears in-scope rows before bulkPut so the
last-writer-wins semantics are honest. Round-trip is verified by a
build → wipe → apply test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pre-sync backup helpers

**Files:**
- Create: `src/lib/sync/preSyncBackup.ts`
- Test: `tests/unit/preSyncBackup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/preSyncBackup.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { seedOyoPackageIfMissing } from '../../src/lib/db/oyo';
import {
	clearPreSyncBackup,
	loadPreSyncBackup,
	savePreSyncBackup
} from '../../src/lib/sync/preSyncBackup';
import type { SyncSnapshot } from '../../src/lib/sync/snapshot';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await seedOyoPackageIfMissing();
});

function fixture(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
	return {
		version: 1,
		exportedAt: '2026-05-29T00:00:00Z',
		lastModifiedAt: '2026-05-29T00:00:00Z',
		device: 'dev-test',
		oyo: { package: null, verses: [] },
		bookmarks: [],
		progress: [],
		activity: [],
		settings: [],
		...overrides
	};
}

describe('preSyncBackup', () => {
	it('returns null when no backup has been saved', async () => {
		expect(await loadPreSyncBackup()).toBeNull();
	});

	it('round-trips: save → load returns the same envelope', async () => {
		const snap = fixture({ lastModifiedAt: '2026-05-29T12:00:00Z' });
		await savePreSyncBackup(snap);
		const loaded = await loadPreSyncBackup();
		expect(loaded?.lastModifiedAt).toBe('2026-05-29T12:00:00Z');
	});

	it('overwrites the previous backup on a second save', async () => {
		await savePreSyncBackup(fixture({ lastModifiedAt: 'a' }));
		await savePreSyncBackup(fixture({ lastModifiedAt: 'b' }));
		expect((await loadPreSyncBackup())?.lastModifiedAt).toBe('b');
	});

	it('clear removes the stored backup', async () => {
		await savePreSyncBackup(fixture());
		await clearPreSyncBackup();
		expect(await loadPreSyncBackup()).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/preSyncBackup.test.ts
```

Expected: 4 failing.

- [ ] **Step 3: Implement `preSyncBackup.ts`**

Create `src/lib/sync/preSyncBackup.ts`:

```ts
import { db } from '$lib/db/local';
import type { SyncSnapshot } from './snapshot';

const KEY = 'pre_sync_backup';

/** Stores the snapshot of local state we plan to overwrite. One slot;
 *  re-calling overwrites the previous backup. */
export async function savePreSyncBackup(snap: SyncSnapshot): Promise<void> {
	await db.settings.put({ key: KEY, value: snap });
}

/** Returns the stored backup, or null when nothing has been saved. */
export async function loadPreSyncBackup(): Promise<SyncSnapshot | null> {
	const row = await db.settings.get(KEY);
	const v = row?.value;
	if (!v || typeof v !== 'object') return null;
	if ((v as { version?: unknown }).version !== 1) return null;
	return v as SyncSnapshot;
}

/** Removes the stored backup (e.g. after a successful "undo"). */
export async function clearPreSyncBackup(): Promise<void> {
	await db.settings.delete(KEY);
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/preSyncBackup.test.ts
npm test
```

Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/preSyncBackup.ts tests/unit/preSyncBackup.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): one-slot pre-sync backup for last-import undo

Saves the local SyncSnapshot to a single pre_sync_backup settings
row before a destructive import. The Settings UI surfaces "직전 동기화
되돌리기" while this row exists; clearing it after the user undoes
or re-syncs keeps the slot stable. Version-guarded on load so a
stale v0 row from a future migration can't be applied.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Google Identity Services wrapper

**Files:**
- Create: `src/lib/cloud/google.ts`
- Test: `tests/unit/google.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/google.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	connectGoogleDrive,
	disconnectGoogleDrive,
	getCurrentAuth
} from '../../src/lib/cloud/google';

beforeEach(async () => {
	await db.delete();
	await db.open();
	vi.stubGlobal('document', {
		createElement: () => ({ set src(v: string) {}, onload: null }),
		head: { appendChild: vi.fn() }
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('google auth state', () => {
	it('getCurrentAuth returns null when not connected', async () => {
		expect(await getCurrentAuth()).toBeNull();
	});

	it('connect → persist → getCurrentAuth returns the row', async () => {
		const fakeTokenClient = {
			requestAccessToken: vi.fn((opts: { callback: (resp: unknown) => void }) => {
				opts.callback({
					access_token: 'tok',
					expires_in: 3600,
					scope: 'https://www.googleapis.com/auth/drive.file'
				});
			})
		};
		vi.stubGlobal('window', {
			google: {
				accounts: {
					oauth2: {
						initTokenClient: vi.fn(() => fakeTokenClient)
					}
				}
			}
		});
		// Skip the script-tag injection branch entirely by pretending the
		// google object already exists.

		// fetch the userinfo email
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ email: 'user@example.com' })
			})
		);

		const auth = await connectGoogleDrive('client-id');
		expect(auth.email).toBe('user@example.com');
		expect(auth.accessToken).toBe('tok');
		expect(auth.expiresAt).toBeGreaterThan(Date.now());

		const stored = await getCurrentAuth();
		expect(stored?.email).toBe('user@example.com');
	});

	it('disconnect clears the stored auth', async () => {
		await db.settings.put({
			key: 'google_drive_auth',
			value: { email: 'x@y.com', accessToken: 't', expiresAt: Date.now() + 1000 }
		});
		await disconnectGoogleDrive();
		expect(await getCurrentAuth()).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/google.test.ts
```

Expected: 3 failing (module missing).

- [ ] **Step 3: Implement `google.ts`**

Create `src/lib/cloud/google.ts`:

```ts
import { db } from '$lib/db/local';

const AUTH_KEY = 'google_drive_auth';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface GoogleAuthState {
	email: string;
	accessToken: string;
	/** epoch ms — when the access token expires */
	expiresAt: number;
}

/** Injects the GIS script tag exactly once. Resolves after onload, or
 *  immediately when window.google.accounts is already present (e.g. in
 *  unit tests that pre-stub the global). */
async function loadGisClient(): Promise<void> {
	if (typeof window === 'undefined') return;
	const g = (window as unknown as { google?: { accounts?: unknown } }).google;
	if (g?.accounts) return;
	await new Promise<void>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = GIS_SRC;
		s.async = true;
		s.defer = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('failed to load Google Identity Services'));
		document.head.appendChild(s);
	});
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	scope: string;
}

/** Opens the GIS consent flow and returns / persists the resulting auth
 *  state. Fetches the user email via the userinfo endpoint so the UI can
 *  render which account is connected. */
export async function connectGoogleDrive(clientId: string): Promise<GoogleAuthState> {
	await loadGisClient();
	const w = window as unknown as {
		google: {
			accounts: {
				oauth2: {
					initTokenClient: (config: {
						client_id: string;
						scope: string;
						callback: (response: TokenResponse) => void;
					}) => { requestAccessToken: (opts?: { prompt?: string }) => void };
				};
			};
		};
	};

	const tokenResponse = await new Promise<TokenResponse>((resolve) => {
		const client = w.google.accounts.oauth2.initTokenClient({
			client_id: clientId,
			scope: DRIVE_SCOPE,
			callback: (response) => resolve(response)
		});
		client.requestAccessToken({ prompt: 'consent' });
	});

	const userRes = await fetch(USERINFO_URL, {
		headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
	});
	if (!userRes.ok) throw new Error(`userinfo failed: HTTP ${userRes.status}`);
	const userinfo = (await userRes.json()) as { email: string };

	const auth: GoogleAuthState = {
		email: userinfo.email,
		accessToken: tokenResponse.access_token,
		expiresAt: Date.now() + tokenResponse.expires_in * 1000
	};
	await db.settings.put({ key: AUTH_KEY, value: auth });
	return auth;
}

/** Returns the stored auth, or null when never connected / disconnected. */
export async function getCurrentAuth(): Promise<GoogleAuthState | null> {
	const row = await db.settings.get(AUTH_KEY);
	const v = row?.value;
	if (!v || typeof v !== 'object') return null;
	const a = v as Partial<GoogleAuthState>;
	if (typeof a.email !== 'string' || typeof a.accessToken !== 'string' || typeof a.expiresAt !== 'number') {
		return null;
	}
	return a as GoogleAuthState;
}

/** Re-runs GIS silent prompt to refresh an access token. Returns the new
 *  state or throws on failure. */
export async function refreshAccessToken(
	clientId: string,
	currentEmail: string
): Promise<GoogleAuthState> {
	await loadGisClient();
	const w = window as unknown as {
		google: {
			accounts: {
				oauth2: {
					initTokenClient: (config: {
						client_id: string;
						scope: string;
						hint?: string;
						callback: (response: TokenResponse) => void;
					}) => { requestAccessToken: (opts?: { prompt?: string }) => void };
				};
			};
		};
	};
	const tokenResponse = await new Promise<TokenResponse>((resolve) => {
		const client = w.google.accounts.oauth2.initTokenClient({
			client_id: clientId,
			scope: DRIVE_SCOPE,
			hint: currentEmail,
			callback: (response) => resolve(response)
		});
		client.requestAccessToken({ prompt: '' });
	});
	const auth: GoogleAuthState = {
		email: currentEmail,
		accessToken: tokenResponse.access_token,
		expiresAt: Date.now() + tokenResponse.expires_in * 1000
	};
	await db.settings.put({ key: AUTH_KEY, value: auth });
	return auth;
}

/** Clears the stored token. Does not revoke the consent — the user can
 *  re-connect immediately without re-consenting. */
export async function disconnectGoogleDrive(): Promise<void> {
	await db.settings.delete(AUTH_KEY);
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/google.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloud/google.ts tests/unit/google.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): Google Identity Services wrapper

connectGoogleDrive triggers the GIS consent flow with drive.file
scope, fetches the email via userinfo, and persists the
GoogleAuthState row. getCurrentAuth and disconnectGoogleDrive cover
the read/clear paths. refreshAccessToken re-runs the silent prompt
when the orchestrator detects an imminent expiry.

Loads the GIS client script via document.createElement at runtime
(SvelteKit SPA), short-circuiting when window.google.accounts is
already present so tests can stub it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Drive REST helpers

**Files:**
- Create: `src/lib/cloud/drive.ts`
- Test: `tests/unit/drive.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/drive.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	downloadSyncFile,
	findSyncFile,
	uploadSyncFile
} from '../../src/lib/cloud/drive';
import type { SyncSnapshot } from '../../src/lib/sync/snapshot';

const TOKEN = 'fake-access-token';

function snapshotFixture(): SyncSnapshot {
	return {
		version: 1,
		exportedAt: '2026-05-29T00:00:00Z',
		lastModifiedAt: '2026-05-29T00:00:00Z',
		device: 'dev-test',
		oyo: { package: null, verses: [] },
		bookmarks: [],
		progress: [],
		activity: [],
		settings: []
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('findSyncFile', () => {
	it('returns null when the appData listing is empty', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ files: [] })
		}));
		expect(await findSyncFile(TOKEN)).toBeNull();
	});

	it('returns the first match with id + modifiedTime', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				files: [{ id: 'fid', modifiedTime: '2026-05-29T10:00:00Z' }]
			})
		}));
		const result = await findSyncFile(TOKEN);
		expect(result).toEqual({ id: 'fid', modifiedTime: '2026-05-29T10:00:00Z' });
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
		await expect(findSyncFile(TOKEN)).rejects.toThrow(/HTTP 401/);
	});
});

describe('downloadSyncFile', () => {
	it('GETs alt=media and parses the JSON body', async () => {
		const payload = snapshotFixture();
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
		vi.stubGlobal('fetch', fetchMock);
		const result = await downloadSyncFile(TOKEN, 'fid');
		expect(result).toEqual(payload);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toContain('alt=media');
		expect(url).toContain('fid');
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(downloadSyncFile(TOKEN, 'fid')).rejects.toThrow(/HTTP 404/);
	});
});

describe('uploadSyncFile', () => {
	it('POSTs a multipart body on first upload (no fileId)', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: 'new-id' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const result = await uploadSyncFile(TOKEN, null, snapshotFixture());
		expect(result.id).toBe('new-id');
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toContain('uploadType=multipart');
		expect(options.method).toBe('POST');
	});

	it('PATCHes by fileId on subsequent upload', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: 'existing' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const result = await uploadSyncFile(TOKEN, 'existing', snapshotFixture());
		expect(result.id).toBe('existing');
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toContain('existing');
		expect(url).toContain('uploadType=media');
		expect(options.method).toBe('PATCH');
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
		await expect(uploadSyncFile(TOKEN, null, snapshotFixture())).rejects.toThrow(/HTTP 503/);
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/drive.test.ts
```

Expected: 8 failing.

- [ ] **Step 3: Implement `drive.ts`**

Create `src/lib/cloud/drive.ts`:

```ts
import type { SyncSnapshot } from '$lib/sync/snapshot';

const FILE_NAME = 'memscripture-sync.json';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

function authHeaders(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

/** Searches the user's appDataFolder for the canonical sync file. */
export async function findSyncFile(
	token: string
): Promise<{ id: string; modifiedTime: string } | null> {
	const q = encodeURIComponent(`name='${FILE_NAME}'`);
	const url = `${API_BASE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`;
	const res = await fetch(url, { headers: authHeaders(token) });
	if (!res.ok) throw new Error(`Drive find: HTTP ${res.status}`);
	const json = (await res.json()) as { files?: { id: string; modifiedTime: string }[] };
	const first = json.files?.[0];
	return first ? { id: first.id, modifiedTime: first.modifiedTime } : null;
}

/** Downloads the JSON body of the given file id. */
export async function downloadSyncFile(token: string, fileId: string): Promise<unknown> {
	const url = `${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
	const res = await fetch(url, { headers: authHeaders(token) });
	if (!res.ok) throw new Error(`Drive download: HTTP ${res.status}`);
	return res.json();
}

/** Uploads the snapshot. When fileId is null, creates the file in
 *  appDataFolder via multipart POST. When a fileId is provided, replaces
 *  the body via PATCH. Returns the resulting file id. */
export async function uploadSyncFile(
	token: string,
	fileId: string | null,
	content: SyncSnapshot
): Promise<{ id: string }> {
	const body = JSON.stringify(content, null, 2);

	if (fileId === null) {
		// First-time create: multipart with metadata + body.
		const boundary = `mem-sync-${Math.random().toString(36).slice(2)}`;
		const meta = { name: FILE_NAME, parents: ['appDataFolder'] };
		const multipart =
			`--${boundary}\r\n` +
			`Content-Type: application/json; charset=UTF-8\r\n\r\n` +
			`${JSON.stringify(meta)}\r\n` +
			`--${boundary}\r\n` +
			`Content-Type: application/json\r\n\r\n` +
			`${body}\r\n` +
			`--${boundary}--`;

		const res = await fetch(
			`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
			{
				method: 'POST',
				headers: {
					...authHeaders(token),
					'Content-Type': `multipart/related; boundary=${boundary}`
				},
				body: multipart
			}
		);
		if (!res.ok) throw new Error(`Drive create: HTTP ${res.status}`);
		const j = (await res.json()) as { id: string };
		return { id: j.id };
	}

	// Subsequent update: PATCH media — replaces the file body in place.
	const res = await fetch(
		`${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`,
		{
			method: 'PATCH',
			headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
			body
		}
	);
	if (!res.ok) throw new Error(`Drive update: HTTP ${res.status}`);
	const j = (await res.json()) as { id: string };
	return { id: j.id };
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/drive.test.ts
```

Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloud/drive.ts tests/unit/drive.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): Drive v3 REST helpers for the appDataFolder sync file

Three calls cover the surface: findSyncFile lists appDataFolder for
the canonical name, downloadSyncFile fetches alt=media body,
uploadSyncFile branches on multipart-create vs PATCH-media-update
based on whether a fileId is supplied. Atomic on Drive's side — a
partial network failure produces a non-OK response, never a partial
file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: syncFlow orchestrator

**Files:**
- Create: `src/lib/sync/syncFlow.ts`
- Test: `tests/unit/syncFlow.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/syncFlow.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/cloud/google', () => ({
	getCurrentAuth: vi.fn(),
	refreshAccessToken: vi.fn()
}));
vi.mock('../../src/lib/cloud/drive', () => ({
	findSyncFile: vi.fn(),
	downloadSyncFile: vi.fn(),
	uploadSyncFile: vi.fn()
}));
vi.mock('../../src/lib/sync/snapshot', () => ({
	buildSyncSnapshot: vi.fn(),
	applySyncSnapshot: vi.fn()
}));
vi.mock('../../src/lib/sync/preSyncBackup', () => ({
	savePreSyncBackup: vi.fn(),
	loadPreSyncBackup: vi.fn(),
	clearPreSyncBackup: vi.fn()
}));

import { getCurrentAuth } from '../../src/lib/cloud/google';
import {
	downloadSyncFile,
	findSyncFile,
	uploadSyncFile
} from '../../src/lib/cloud/drive';
import {
	applySyncSnapshot,
	buildSyncSnapshot
} from '../../src/lib/sync/snapshot';
import { savePreSyncBackup } from '../../src/lib/sync/preSyncBackup';
import { performSync } from '../../src/lib/sync/syncFlow';

function snap(lastModifiedAt: string) {
	return {
		version: 1 as const,
		exportedAt: 'irrelevant',
		lastModifiedAt,
		device: 'dev-test',
		oyo: { package: null, verses: [] },
		bookmarks: [],
		progress: [],
		activity: [],
		settings: []
	};
}

beforeEach(() => {
	vi.mocked(getCurrentAuth).mockResolvedValue({
		email: 'u@x.com',
		accessToken: 'tok',
		expiresAt: Date.now() + 60_000
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('performSync', () => {
	it('not-authenticated → error result', async () => {
		vi.mocked(getCurrentAuth).mockResolvedValue(null);
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('error');
	});

	it('no remote → builds local and uploads as create', async () => {
		vi.mocked(findSyncFile).mockResolvedValue(null);
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'new' });
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('no-remote-uploaded');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBeNull();
	});

	it('remote equal → reports remote-equal, no IO', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('remote-equal');
		expect(uploadSyncFile).not.toHaveBeenCalled();
		expect(applySyncSnapshot).not.toHaveBeenCalled();
	});

	it('local newer → PATCH uploads local to existing file', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T09:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('local-newer-uploaded');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBe('fid');
	});

	it('remote newer + user confirms → saves backup + applies remote', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T11:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('remote-newer-imported');
		expect(savePreSyncBackup).toHaveBeenCalledTimes(1);
		expect(applySyncSnapshot).toHaveBeenCalledTimes(1);
	});

	it('remote newer + user declines → no backup, no apply', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T11:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => false });
		expect(res.kind).toBe('remote-newer-declined');
		expect(savePreSyncBackup).not.toHaveBeenCalled();
		expect(applySyncSnapshot).not.toHaveBeenCalled();
	});

	it('returns error result when a Drive call throws', async () => {
		vi.mocked(findSyncFile).mockRejectedValue(new Error('HTTP 500'));
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('error');
		if (res.kind === 'error') expect(res.message).toMatch(/500/);
	});
});
```

- [ ] **Step 2: Run tests and confirm fail**

```bash
npx vitest run tests/unit/syncFlow.test.ts
```

Expected: 7 failing.

- [ ] **Step 3: Implement `syncFlow.ts`**

Create `src/lib/sync/syncFlow.ts`:

```ts
import { getCurrentAuth } from '$lib/cloud/google';
import {
	downloadSyncFile,
	findSyncFile,
	uploadSyncFile
} from '$lib/cloud/drive';
import {
	applySyncSnapshot,
	buildSyncSnapshot,
	type SyncSnapshot
} from './snapshot';
import { savePreSyncBackup } from './preSyncBackup';

export type SyncResult =
	| { kind: 'no-remote-uploaded' }
	| { kind: 'remote-equal' }
	| { kind: 'local-newer-uploaded' }
	| { kind: 'remote-newer-imported' }
	| { kind: 'remote-newer-declined' }
	| { kind: 'error'; message: string };

export interface SyncHandlers {
	/** Resolves with true when the user agreed to overwrite local state. */
	confirmOverwrite: () => Promise<boolean>;
}

/** Single-button sync orchestrator. Decision tree:
 *  - not authenticated → error
 *  - no remote file    → upload local (create)
 *  - timestamps equal  → no-op
 *  - local newer       → upload local (PATCH)
 *  - remote newer      → confirm → save backup + apply remote (or decline) */
export async function performSync(handlers: SyncHandlers): Promise<SyncResult> {
	const auth = await getCurrentAuth();
	if (!auth) return { kind: 'error', message: '연결된 Google Drive 계정이 없어요' };

	try {
		const found = await findSyncFile(auth.accessToken);
		const localSnap = await buildSyncSnapshot();

		if (!found) {
			await uploadSyncFile(auth.accessToken, null, localSnap);
			return { kind: 'no-remote-uploaded' };
		}

		const remoteRaw = await downloadSyncFile(auth.accessToken, found.id);
		const remoteSnap = remoteRaw as SyncSnapshot;
		const localTs = localSnap.lastModifiedAt;
		const remoteTs = remoteSnap.lastModifiedAt ?? '';

		if (localTs === remoteTs) return { kind: 'remote-equal' };
		if (localTs > remoteTs) {
			await uploadSyncFile(auth.accessToken, found.id, localSnap);
			return { kind: 'local-newer-uploaded' };
		}

		// remote > local
		const ok = await handlers.confirmOverwrite();
		if (!ok) return { kind: 'remote-newer-declined' };
		await savePreSyncBackup(localSnap);
		await applySyncSnapshot(remoteSnap);
		return { kind: 'remote-newer-imported' };
	} catch (err) {
		return {
			kind: 'error',
			message: err instanceof Error ? err.message : String(err)
		};
	}
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/unit/syncFlow.test.ts
npm test
```

Expected: 7 pass + full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/syncFlow.ts tests/unit/syncFlow.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): performSync orchestrator + decision matrix tests

Single entry point the Settings UI calls. Returns a discriminated
union so the UI can surface different toasts for each terminal state
without re-reading internal sync state. Confirm-before-overwrite is
delegated to the caller via SyncHandlers.confirmOverwrite so the
orchestrator stays free of UI concerns.

All four happy paths (no-remote, equal, local-newer, remote-newer
with confirm/decline) and the error path are covered by tests that
mock the cloud + dexie + snapshot modules at boundaries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Settings UI — "클라우드 동기화" section

**Files:**
- Modify: `src/routes/settings/+page.svelte` (currently a placeholder)
- (No new test file — UI behavior is best covered manually + by the unit-tested orchestrator)

- [ ] **Step 1: Replace the placeholder with the sync section**

Read the current `src/routes/settings/+page.svelte` so you don't lose surrounding header/main wrappers, then replace its body with this implementation. The page imports `getCurrentAuth`, `connectGoogleDrive`, `disconnectGoogleDrive` from `$lib/cloud/google`, plus `performSync` and `loadPreSyncBackup` + `applySyncSnapshot`, and uses the existing `Toast` component:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { goto } from '$app/navigation';
	import { Cloud, CloudOff, RotateCcw } from 'lucide-svelte';
	import { getGoogleOauthClientId } from '$lib/sync/clientId';
	import {
		connectGoogleDrive,
		disconnectGoogleDrive,
		getCurrentAuth,
		type GoogleAuthState
	} from '$lib/cloud/google';
	import { performSync, type SyncResult } from '$lib/sync/syncFlow';
	import {
		applySyncSnapshot
	} from '$lib/sync/snapshot';
	import {
		clearPreSyncBackup,
		loadPreSyncBackup
	} from '$lib/sync/preSyncBackup';

	const clientId = getGoogleOauthClientId();
	let auth = $state<GoogleAuthState | null>(null);
	let hasBackup = $state(false);
	let syncing = $state(false);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	$effect(() => {
		let active = true;
		(async () => {
			const [a, b] = await Promise.all([getCurrentAuth(), loadPreSyncBackup()]);
			if (active) {
				auth = a;
				hasBackup = b !== null;
			}
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	async function onConnect() {
		if (!clientId) return;
		try {
			auth = await connectGoogleDrive(clientId);
			toast = { message: `${auth.email} 으로 연결됐어요` };
		} catch (err) {
			toast = { message: '연결 실패: 다시 시도해주세요' };
		}
	}

	async function onDisconnect() {
		await disconnectGoogleDrive();
		auth = null;
		toast = { message: 'Drive 연결이 해제됐어요' };
	}

	async function onSync() {
		if (syncing) return;
		syncing = true;
		const result = await performSync({
			confirmOverwrite: async () =>
				window.confirm('Drive에 더 최신 데이터가 있어요. 로컬 변경사항을 덮어쓸까요?')
		});
		syncing = false;
		hasBackup = (await loadPreSyncBackup()) !== null;
		toast = { message: messageFor(result) };
	}

	function messageFor(result: SyncResult): string {
		switch (result.kind) {
			case 'no-remote-uploaded':
				return 'Drive에 처음 저장했어요';
			case 'remote-equal':
				return '이미 최신 상태예요';
			case 'local-newer-uploaded':
				return 'Drive로 올렸어요';
			case 'remote-newer-imported':
				return 'Drive에서 받아왔어요';
			case 'remote-newer-declined':
				return '동기화를 취소했어요';
			case 'error':
				return `동기화 실패: ${result.message}`;
		}
	}

	async function onUndo() {
		const backup = await loadPreSyncBackup();
		if (!backup) return;
		await applySyncSnapshot(backup);
		await clearPreSyncBackup();
		hasBackup = false;
		toast = { message: '직전 동기화를 되돌렸어요' };
	}
</script>

<Header title="Settings" onBack={() => goto('/')} showSettings={false} />

<main class="mx-auto max-w-2xl px-5 pt-6">
	<section
		class="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Cloud size={18} strokeWidth={1.75} />
			클라우드 동기화
		</h2>

		{#if !clientId}
			<p class="mt-3 text-[13px] text-[var(--color-text-tertiary)]">
				이 배포에는 Google OAuth 클라이언트 ID가 설정되지 않았습니다.
				docs/google-drive-setup.md를 참고하세요.
			</p>
		{:else if !auth}
			<p class="mt-3 text-[13px] text-[var(--color-text-secondary)]">
				Drive와 연결되지 않음
			</p>
			<button
				type="button"
				onclick={onConnect}
				class="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				Google Drive 연결
			</button>
		{:else}
			<p class="mt-3 text-[13px] text-[var(--color-text-secondary)]">
				연결됨 · <span class="font-medium text-[var(--color-text)]">{auth.email}</span>
			</p>
			<div class="mt-4 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={onSync}
					disabled={syncing}
					class="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{syncing ? '동기화 중…' : '지금 동기화'}
				</button>
				{#if hasBackup}
					<button
						type="button"
						onclick={onUndo}
						class="inline-flex items-center gap-2 rounded-full bg-[var(--color-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
					>
						<RotateCcw size={14} strokeWidth={1.75} />
						직전 동기화 되돌리기
					</button>
				{/if}
				<button
					type="button"
					onclick={onDisconnect}
					class="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-danger)]"
				>
					<CloudOff size={14} strokeWidth={1.75} />
					연결 해제
				</button>
			</div>
		{/if}
	</section>
</main>

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}
```

- [ ] **Step 2: Smoke-test in dev**

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 4
tail -5 /tmp/dev.log
```

Open `http://localhost:5173/settings` (or whichever port reports). With no env var set, the "이 배포에는 Google OAuth 클라이언트 ID가 설정되지 않았습니다" copy should render. Set `PUBLIC_GOOGLE_OAUTH_CLIENT_ID=anything` in `.env`, restart dev, and confirm the connect button now shows (won't successfully connect without a real GCP project, but the UI state should be correct).

Stop the dev server when done (`kill <PID>`).

- [ ] **Step 3: Run the full unit suite**

```bash
npm test
```

Expected: previous count + 0 (no new unit tests this task — UI is covered manually + by the orchestrator unit tests).

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/+page.svelte
git commit -m "$(cat <<'EOF'
feat(sync): /settings 클라우드 동기화 section

State machine: missing env → setup hint, no auth → 연결 버튼, auth →
지금 동기화 + 직전 동기화 되돌리기 (when backup exists) + 연결 해제.
The orchestrator's confirmOverwrite handler is currently a
window.confirm — a follow-up will swap to an in-app modal so it
matches the Toast-style design language.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: GCP setup guide (maintainer doc)

**Files:**
- Create: `docs/google-drive-setup.md`

- [ ] **Step 1: Write the guide**

Create `docs/google-drive-setup.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/google-drive-setup.md
git commit -m "$(cat <<'EOF'
docs(sync): GCP project setup guide for Drive sync

Walks the maintainer through creating the Google Cloud project,
enabling the Drive API, configuring the OAuth consent screen, and
creating the web-app client ID. Captures the drive.file scope choice
and why it sidesteps Google's app verification gate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Replace `window.confirm` with an in-app overwrite confirm dialog

**Files:**
- Create: `src/lib/components/feedback/ConfirmDialog.svelte`
- Modify: `src/routes/settings/+page.svelte` — swap `window.confirm` for the new dialog

- [ ] **Step 1: Implement `ConfirmDialog.svelte`**

Create `src/lib/components/feedback/ConfirmDialog.svelte`:

```svelte
<script lang="ts">
	interface Props {
		open: boolean;
		title: string;
		body: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	}
	let {
		open,
		title,
		body,
		confirmLabel = '확인',
		cancelLabel = '취소',
		onConfirm,
		onCancel
	}: Props = $props();

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div
		class="fixed inset-0 z-[55] bg-black/30"
		onclick={onCancel}
		role="presentation"
		aria-hidden="true"
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-title"
		class="fixed inset-x-5 top-1/2 z-[60] mx-auto max-w-md -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-2xl"
	>
		<h2 id="confirm-title" class="text-[15px] font-semibold text-[var(--color-text)]">
			{title}
		</h2>
		<p class="mt-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
			{body}
		</p>
		<div class="mt-5 flex items-center justify-end gap-2">
			<button
				type="button"
				onclick={onCancel}
				class="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				{cancelLabel}
			</button>
			<button
				type="button"
				onclick={onConfirm}
				class="rounded-full bg-[var(--color-danger)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				{confirmLabel}
			</button>
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Wire it into Settings**

Update `src/routes/settings/+page.svelte`'s script: add a `confirmState` state slot, swap `confirmOverwrite` to resolve a promise the dialog satisfies.

Add the import alongside other imports:

```ts
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';
```

Add the state and helper inside the script block (above `onSync`):

```ts
let confirmState = $state<{
	open: boolean;
	resolve: ((ok: boolean) => void) | null;
}>({ open: false, resolve: null });

function showOverwriteConfirm(): Promise<boolean> {
	return new Promise((resolve) => {
		confirmState = { open: true, resolve };
	});
}

function onConfirm() {
	confirmState.resolve?.(true);
	confirmState = { open: false, resolve: null };
}

function onCancel() {
	confirmState.resolve?.(false);
	confirmState = { open: false, resolve: null };
}
```

Update `onSync` to call `showOverwriteConfirm` instead of `window.confirm`:

```ts
async function onSync() {
	if (syncing) return;
	syncing = true;
	const result = await performSync({ confirmOverwrite: showOverwriteConfirm });
	syncing = false;
	hasBackup = (await loadPreSyncBackup()) !== null;
	toast = { message: messageFor(result) };
}
```

Add the dialog at the bottom of the template, alongside the `{#if toast}` block:

```svelte
<ConfirmDialog
	open={confirmState.open}
	title="Drive에서 받아오기"
	body="Drive에 더 최신 데이터가 있어요. 가져오면 로컬 변경사항이 덮어쓰여집니다."
	confirmLabel="덮어쓰고 받기"
	cancelLabel="취소"
	onConfirm={onConfirm}
	onCancel={onCancel}
/>
```

- [ ] **Step 3: Smoke-test the dialog**

Restart dev (`npm run dev`), connect a fake config, click 지금 동기화. The dialog should NOT render until the orchestrator returns the `remote-newer` branch — for a manual smoke without a real Drive, simulate by temporarily editing `performSync` to call `confirmOverwrite()` unconditionally and verify the dialog opens, cancel/confirm both close it cleanly. Revert the simulation before committing.

- [ ] **Step 4: Run the full unit suite**

```bash
npm test
```

Expected: 0 regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/feedback/ConfirmDialog.svelte src/routes/settings/+page.svelte
git commit -m "$(cat <<'EOF'
feat(sync): in-app overwrite confirm dialog (replaces window.confirm)

ConfirmDialog is a generic small modal — title + body + two buttons,
backdrop + Escape close. The Settings sync handler resolves the
orchestrator's confirmOverwrite via the dialog's confirm/cancel.

Stays inside the design system (var-driven colors, danger button on
the destructive action) and respects the same z-index conventions as
the bottom-sheet and toast patterns (backdrop z-55, dialog z-60).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Summary

**Spec coverage:**
- "Data scope (six tables)" → Task 3 (snapshot)
- "Snapshot envelope (v1 + lastModifiedAt + device)" → Task 3
- "Auth — GIS + drive.file scope" → Task 5 (google.ts) + Task 9 (GCP setup)
- "Drive REST surface (3 calls)" → Task 6 (drive.ts)
- "Sync flow decision tree" → Task 7 (syncFlow.ts)
- "Tracking lastModifiedAt across mutators" → Task 2 (touchData + wiring)
- "Pre-sync backup with 1-step undo" → Task 4 (preSyncBackup) + Task 8 (UI undo button)
- "Settings UI 클라우드 동기화 section" → Task 8
- "Confirm-before-overwrite" → Task 10 (in-app dialog replaces window.confirm)
- "PUBLIC_GOOGLE_OAUTH_CLIENT_ID env wiring" → Task 1
- "Edge cases: first-sync on fresh device" → handled by Task 7 (no-remote-uploaded branch + remote-newer-imported handles fresh-with-existing-remote)
- "Edge cases: token expired mid-sync" → currently handled via the error path; Task 7's test "returns error result when a Drive call throws" exercises it. A follow-up to add 401 → silent-refresh-retry is mentioned in Task 5's `refreshAccessToken` but not yet wired into the orchestrator; this is the only spec item left unwired and is intentional for Phase 1 (next phase or follow-up).

**Placeholder scan:** no TBDs, no "add appropriate error handling" hand-waves, every code step has full code, every test step has full assertions.

**Type consistency:**
- `SyncSnapshot` defined in Task 3, referenced in Tasks 4, 5(?), 6, 7, 8.
- `GoogleAuthState` defined in Task 5, used in Task 7's mock and Task 8.
- `SyncResult` discriminated union defined in Task 7, exhaustively switched in Task 8's `messageFor`.
- `SyncHandlers.confirmOverwrite` defined in Task 7, supplied in Task 8 + Task 10.
- `touchDataModified` signature consistent across Tasks 2 and 3 (test imports it).
- `OYO_PACKAGE_ID` (existing) referenced consistently.

**Scope check:** Single deliverable, single phase. No subsystem decomposition needed.

**Known follow-up (not in Phase 1):**
- 401 → silent refresh → retry inside the orchestrator (currently bubbles as `error`).
- `lastSyncAt` timestamp display in the UI (the spec mentions it; the current UI shows only "연결됨" without a last-sync line).
- These are deliberate deferrals; the core sync mechanism is complete.
