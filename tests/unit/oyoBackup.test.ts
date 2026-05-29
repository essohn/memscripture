import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { createOyoVerse, listOyoVerses, seedOyoPackageIfMissing } from '../../src/lib/db/oyo';
import { applyOyoBackup, buildOyoBackup } from '../../src/lib/db/oyoBackup';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await seedOyoPackageIfMissing();
});

describe('buildOyoBackup', () => {
	it('returns a v1 envelope with empty arrays for tags and assignments', async () => {
		const b = await buildOyoBackup();
		expect(b.version).toBe(1);
		expect(b.packageId).toBe('oyo');
		expect(typeof b.exportedAt).toBe('string');
		expect(b.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(b.tags).toEqual([]);
		expect(b.assignments).toEqual([]);
		expect(b.verses).toEqual([]);
	});

	it('serializes every OYO verse without the package_id field', async () => {
		await createOyoVerse({ cite: '요한복음 3 : 16', title: '영생', w: '하나님이…' });
		await createOyoVerse({ cite: '시편 23 : 1', title: '목자', w: '주는 나의 목자' });

		const b = await buildOyoBackup();
		expect(b.verses).toHaveLength(2);
		expect(b.verses[0]).toEqual({
			no: 1,
			i: 1,
			title: '영생',
			cite: '요한복음 3 : 16',
			w: '하나님이…'
		});
		// package_id is implicit from the envelope, no need to repeat per row
		expect(b.verses[0]).not.toHaveProperty('package_id');
	});
});

describe('applyOyoBackup', () => {
	it('imports verses with fresh `no` allocations starting at max+1', async () => {
		await createOyoVerse({ cite: '예비 1', title: '', w: 'a' });
		const backup = {
			version: 1,
			exportedAt: '2026-05-29T00:00:00Z',
			packageId: 'oyo' as const,
			verses: [
				{ no: 7, i: 7, title: 't1', cite: 'c1', w: 'w1' },
				{ no: 8, i: 8, title: 't2', cite: 'c2', w: 'w2' }
			],
			tags: [],
			assignments: []
		};
		const res = await applyOyoBackup(backup);
		expect(res).toEqual({ imported: 2, skipped: 0 });

		const list = await listOyoVerses();
		// 1 existing + 2 imported, monotonic no starting from existing max
		expect(list.map((v) => v.no)).toEqual([1, 2, 3]);
		// Imported `no` from the file is ignored — local allocation wins
		expect(list[1].cite).toBe('c1');
		expect(list[2].cite).toBe('c2');
	});

	it('skips duplicates identified by (cite, w)', async () => {
		await createOyoVerse({ cite: '요한복음 3 : 16', title: '영생', w: '하나님이…' });
		const backup = {
			version: 1,
			exportedAt: '2026-05-29T00:00:00Z',
			packageId: 'oyo' as const,
			verses: [
				// Exact match (cite, w) — skipped even though title differs
				{ no: 1, i: 1, title: '다른 제목', cite: '요한복음 3 : 16', w: '하나님이…' },
				// New verse
				{ no: 2, i: 2, title: '목자', cite: '시편 23 : 1', w: '주는 나의 목자' }
			],
			tags: [],
			assignments: []
		};
		const res = await applyOyoBackup(backup);
		expect(res).toEqual({ imported: 1, skipped: 1 });
		expect(await listOyoVerses()).toHaveLength(2);
	});

	it('round-trips: build → apply into an empty DB → identical visible state', async () => {
		await createOyoVerse({ cite: 'A', title: 't1', w: 'a' });
		await createOyoVerse({ cite: 'B', title: 't2', w: 'b' });
		const backup = await buildOyoBackup();

		// Reset and apply
		await db.delete();
		await db.open();
		await seedOyoPackageIfMissing();
		const res = await applyOyoBackup(backup);
		expect(res).toEqual({ imported: 2, skipped: 0 });

		const list = await listOyoVerses();
		expect(list.map((v) => ({ cite: v.cite, title: v.title, w: v.w }))).toEqual([
			{ cite: 'A', title: 't1', w: 'a' },
			{ cite: 'B', title: 't2', w: 'b' }
		]);
	});

	it('rejects unknown versions', async () => {
		await expect(applyOyoBackup({ version: 99, verses: [] })).rejects.toThrow(/version/);
	});

	it('rejects payloads missing the verses array', async () => {
		await expect(applyOyoBackup({ version: 1 })).rejects.toThrow(/verses/);
	});

	it('rejects rows without cite or w', async () => {
		await expect(
			applyOyoBackup({ version: 1, verses: [{ title: 't' }] })
		).rejects.toThrow(/cite or w/);
	});
});
