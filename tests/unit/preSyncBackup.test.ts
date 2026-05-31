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
		verseRatings: [],
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

	it('clear is idempotent — no-op on an empty store', async () => {
		await expect(clearPreSyncBackup()).resolves.toBeUndefined();
	});

	it('load returns null on a malformed row missing required arrays', async () => {
		// Simulate a partially-written backup: version field present, structural
		// fields missing. Without the shape guard, this would silently round-trip
		// as a "valid" snapshot.
		await db.settings.put({ key: 'pre_sync_backup', value: { version: 1 } });
		expect(await loadPreSyncBackup()).toBeNull();
	});
});
