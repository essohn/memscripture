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
import {
	getVerseRating,
	setFullDifficulty,
	setStartDifficulty
} from '../../src/lib/db/verseRatings';
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
		// Device-local rows (sync_device_id, google_drive_auth, pre_sync_backup)
		// are stripped before serialization.
		expect(snap.settings).toEqual([]);
	});

	it('strips device-local settings rows from the envelope', async () => {
		await db.settings.put({ key: 'view_options', value: { showVerseTextInList: true } });
		await db.settings.put({
			key: 'google_drive_auth',
			value: { email: 'x@y.com', accessToken: 't', expiresAt: Date.now() + 1000 }
		});

		const snap = await buildSyncSnapshot();
		// view_options survives; google_drive_auth (and the device id) do not.
		expect(snap.settings.find((s) => s.key === 'view_options')).toBeDefined();
		expect(snap.settings.find((s) => s.key === 'google_drive_auth')).toBeUndefined();
		expect(snap.settings.find((s) => s.key === 'sync_device_id')).toBeUndefined();
		expect(snap.settings.find((s) => s.key === 'pre_sync_backup')).toBeUndefined();
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

	it('round-trips verseRatings (build → wipe → apply preserves both fields)', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 4);
		await setStartDifficulty('5_krv', 3, 5);

		const snap = await buildSyncSnapshot();
		expect(snap.verseRatings).toHaveLength(2);

		await db.delete();
		await db.open();
		await seedOyoPackageIfMissing();

		await applySyncSnapshot(snap);

		const r1 = await getVerseRating('5_krv', 1);
		const r3 = await getVerseRating('5_krv', 3);
		expect(r1?.startDifficulty).toBe(2);
		expect(r1?.fullDifficulty).toBe(4);
		expect(r3?.startDifficulty).toBe(5);
	});

	it('preserves device-local settings rows across the apply', async () => {
		// Stage: local device has its own auth + device id + a freshly-written
		// pre_sync_backup blob saved by the orchestrator immediately before
		// applySyncSnapshot would run.
		await db.settings.put({
			key: 'google_drive_auth',
			value: { email: 'local@x.com', accessToken: 'local-tok', expiresAt: Date.now() + 1000 }
		});
		await db.settings.put({ key: 'sync_device_id', value: 'local-device-uuid' });
		await db.settings.put({ key: 'pre_sync_backup', value: { version: 1, marker: 'undo-slot' } });

		// Remote snapshot from a different device. Its settings array does NOT
		// contain those keys (build-time filter), and even if it did the apply
		// should still preserve the local rows.
		const remoteSnap = {
			version: 1 as const,
			exportedAt: '2026-05-29T00:00:00Z',
			lastModifiedAt: '2026-05-29T00:00:00Z',
			device: 'other-device',
			oyo: { package: null, verses: [] },
			bookmarks: [],
			progress: [],
			activity: [],
			settings: [{ key: 'view_options', value: { showVerseTextInList: false } }]
		};

		await applySyncSnapshot(remoteSnap);

		// Local auth and device id survive.
		const auth = await db.settings.get('google_drive_auth');
		expect((auth?.value as { email: string }).email).toBe('local@x.com');
		const devId = await db.settings.get('sync_device_id');
		expect(devId?.value).toBe('local-device-uuid');
		// pre_sync_backup must still be present so the user can undo.
		const backup = await db.settings.get('pre_sync_backup');
		expect(backup).toBeDefined();
		// view_options from the snapshot is applied.
		const viewOpts = await db.settings.get('view_options');
		expect((viewOpts?.value as { showVerseTextInList: boolean }).showVerseTextInList).toBe(false);
	});
});
