import { describe, expect, it } from 'vitest';
import { mergeSnapshots } from '../../src/lib/sync/merge';
import type { SyncSnapshot } from '../../src/lib/sync/snapshot';

const snap = (over: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
	version: 1,
	exportedAt: '2026-01-01T00:00:00.000Z',
	lastModifiedAt: '2026-01-01T00:00:00.000Z',
	device: 'pc',
	oyo: { package: null, verses: [] },
	bookmarks: [],
	progress: [],
	activity: [],
	settings: [],
	verseRatings: [],
	checkHistory: [],
	verseMarks: [],
	...over
});

const rating = (id: string, updatedAt: number, full: number | null = 5) =>
	({ id, packageId: '900_krv', verseNo: Number(id.split(':')[1]), startDifficulty: 5, fullDifficulty: full, updatedAt }) as never;

describe('the failure this replaces', () => {
	// A phone installed fresh, which had done nothing but join a team, carried a
	// newer timestamp than a year of records on a desktop — and the upload
	// direction had neither a confirmation nor a backup.
	it('a newly installed device does not erase an established one', () => {
		const desktop = snap({
			device: 'pc',
			lastModifiedAt: '2026-01-01T00:00:00.000Z',
			verseRatings: Array.from({ length: 300 }, (_, i) => rating(`900_krv:${i}`, 1000))
		});
		const freshPhone = snap({
			device: 'phone',
			// later clock, no records
			lastModifiedAt: '2026-08-20T00:00:00.000Z',
			settings: [{ key: 'joined_groups', value: ['cdm-b'] }] as never
		});

		const merged = mergeSnapshots(freshPhone, desktop);
		expect(merged.verseRatings).toHaveLength(300);
		expect(merged.settings).toEqual([{ key: 'joined_groups', value: ['cdm-b'] }]);
	});
});

describe('per-record resolution', () => {
	it('keeps the newer rating for a verse both devices touched', () => {
		const a = snap({ verseRatings: [rating('900_krv:1', 100, 2)] });
		const b = snap({ verseRatings: [rating('900_krv:1', 200, 5)] });
		expect(mergeSnapshots(a, b).verseRatings).toEqual([rating('900_krv:1', 200, 5)]);
	});

	it('keeps records only one device has, from either side', () => {
		const a = snap({ verseRatings: [rating('900_krv:1', 100)] });
		const b = snap({ verseRatings: [rating('900_krv:2', 100)] });
		expect(mergeSnapshots(a, b).verseRatings.map((r) => r.id).sort()).toEqual([
			'900_krv:1',
			'900_krv:2'
		]);
	});

	it('is order-independent', () => {
		const a = snap({ verseRatings: [rating('900_krv:1', 100, 2)] });
		const b = snap({ verseRatings: [rating('900_krv:1', 200, 5)] });
		expect(mergeSnapshots(a, b).verseRatings).toEqual(mergeSnapshots(b, a).verseRatings);
	});

	// Merging twice must not keep changing the answer, or two devices syncing
	// repeatedly would never agree.
	it('is idempotent', () => {
		const a = snap({ verseRatings: [rating('900_krv:1', 100)] });
		const b = snap({ verseRatings: [rating('900_krv:2', 200)] });
		const once = mergeSnapshots(a, b);
		expect(mergeSnapshots(once, once)).toEqual(once);
		expect(mergeSnapshots(once, b)).toEqual(once);
	});
});

describe('append-only collections union', () => {
	it('keeps every check either device recorded', () => {
		const a = snap({ checkHistory: [{ id: 'x:1:100:0', verseKey: 'x:1', packageId: 'x', verseNo: 1, checkedAt: 100, start: 5, full: 5, accuracy: 1, elapsedMs: 1 }] as never });
		const b = snap({ checkHistory: [{ id: 'x:1:200:0', verseKey: 'x:1', packageId: 'x', verseNo: 1, checkedAt: 200, start: 4, full: 4, accuracy: 0.9, elapsedMs: 1 }] as never });
		expect(mergeSnapshots(a, b).checkHistory).toHaveLength(2);
	});

	it('unions the days each device was active', () => {
		const a = snap({ activity: [{ dateKey: '2026-01-01' }] as never });
		const b = snap({ activity: [{ dateKey: '2026-01-02' }] as never });
		expect(mergeSnapshots(a, b).activity.map((x) => x.dateKey).sort()).toEqual([
			'2026-01-01',
			'2026-01-02'
		]);
	});

	it('keeps verses written on either device', () => {
		const v = (no: number) => ({ package_id: 'oyo', no, i: no, title: 't', cite: 'c', w: 'w' });
		const a = snap({ oyo: { package: null, verses: [v(1)] as never } });
		const b = snap({ oyo: { package: null, verses: [v(2)] as never } });
		expect(mergeSnapshots(a, b).oyo.verses).toHaveLength(2);
	});
});

describe('settings, which carry no per-key timestamp', () => {
	it('takes the later snapshot value for a key both set', () => {
		const older = snap({ lastModifiedAt: '2026-01-01T00:00:00.000Z', settings: [{ key: 'view_options', value: { verseFontScale: 0.9 } }] as never });
		const newer = snap({ lastModifiedAt: '2026-06-01T00:00:00.000Z', settings: [{ key: 'view_options', value: { verseFontScale: 1.3 } }] as never });
		const merged = mergeSnapshots(older, newer);
		expect(merged.settings).toEqual([{ key: 'view_options', value: { verseFontScale: 1.3 } }]);
	});

	it('keeps a key only one side has', () => {
		const a = snap({ settings: [{ key: 'a', value: 1 }] as never });
		const b = snap({ lastModifiedAt: '2026-06-01T00:00:00.000Z', settings: [{ key: 'b', value: 2 }] as never });
		expect(mergeSnapshots(a, b).settings.map((s) => s.key).sort()).toEqual(['a', 'b']);
	});

	// The merged envelope must not carry the scratch field used to rank them.
	it('leaves no internal ranking field behind', () => {
		const a = snap({ settings: [{ key: 'a', value: 1 }] as never });
		const merged = mergeSnapshots(a, snap());
		expect(Object.keys(merged.settings[0])).toEqual(['key', 'value']);
	});
});

describe('the envelope', () => {
	it('carries the later timestamp forward', () => {
		const a = snap({ lastModifiedAt: '2026-01-01T00:00:00.000Z' });
		const b = snap({ lastModifiedAt: '2026-06-01T00:00:00.000Z' });
		expect(mergeSnapshots(a, b).lastModifiedAt).toBe('2026-06-01T00:00:00.000Z');
	});

	// A snapshot written before checkHistory or verseMarks existed has neither.
	it('merges a snapshot from an older schema', () => {
		const legacy = { ...snap() } as SyncSnapshot;
		delete (legacy as { checkHistory?: unknown }).checkHistory;
		delete (legacy as { verseMarks?: unknown }).verseMarks;
		const current = snap({ verseMarks: [{ id: 'x:1', packageId: 'x', verseNo: 1, words: [], updatedAt: 5 }] as never });
		expect(mergeSnapshots(legacy, current).verseMarks).toHaveLength(1);
		expect(mergeSnapshots(legacy, current).checkHistory).toEqual([]);
	});
});

describe('a deleted check stays deleted', () => {
	const check = (id: string, checkedAt: number) =>
		({ id, verseKey: 'x:1', packageId: 'x', verseNo: 1, checkedAt, start: 5, full: 5, accuracy: 1, elapsedMs: 1 }) as never;

	// The union that keeps both devices' checks is exactly what hands a deleted
	// one back, so the tombstone is the only thing standing between "I removed
	// that" and it returning on the next open.
	it('subtracts a tombstone from the other device copy', () => {
		const deleted = snap({ checkDeletions: [{ id: 'x:1:100:0', deletedAt: 500 }] as never });
		const stillHasIt = snap({ checkHistory: [check('x:1:100:0', 100)] as never });

		expect(mergeSnapshots(deleted, stillHasIt).checkHistory).toEqual([]);
	});

	it('subtracts it whichever side the tombstone arrives from', () => {
		const deleted = snap({ checkDeletions: [{ id: 'x:1:100:0', deletedAt: 500 }] as never });
		const stillHasIt = snap({ checkHistory: [check('x:1:100:0', 100)] as never });

		expect(mergeSnapshots(stillHasIt, deleted).checkHistory).toEqual([]);
	});

	// One deletion must not take the verse's other checks with it.
	it('leaves every check it does not name alone', () => {
		const deleted = snap({
			checkHistory: [check('x:1:200:0', 200)] as never,
			checkDeletions: [{ id: 'x:1:100:0', deletedAt: 500 }] as never
		});
		const stillHasIt = snap({
			checkHistory: [check('x:1:100:0', 100), check('x:1:200:0', 200)] as never
		});

		expect(mergeSnapshots(deleted, stillHasIt).checkHistory?.map((c) => c.id)).toEqual([
			'x:1:200:0'
		]);
	});

	// The other device has to learn about the deletion, or it would keep
	// re-offering the row every time it syncs.
	it('carries the tombstones through to the merged snapshot', () => {
		const a = snap({ checkDeletions: [{ id: 'x:1:100:0', deletedAt: 500 }] as never });
		const b = snap({ checkDeletions: [{ id: 'x:1:200:0', deletedAt: 600 }] as never });

		expect(mergeSnapshots(a, b).checkDeletions?.map((d) => d.id).sort()).toEqual([
			'x:1:100:0',
			'x:1:200:0'
		]);
	});

	// A snapshot written before v9 has no tombstones at all and must merge
	// exactly as it did before.
	it('merges a snapshot that predates tombstones', () => {
		const old = snap({ checkHistory: [check('x:1:100:0', 100)] as never });
		delete (old as { checkDeletions?: unknown }).checkDeletions;

		expect(mergeSnapshots(old, snap({})).checkHistory?.map((c) => c.id)).toEqual(['x:1:100:0']);
	});
});
