import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('local db schema v6', () => {
	it('exposes all 9 tables', () => {
		const names = db.tables.map((t) => t.name).sort();
		expect(names).toEqual([
			'activity',
			'bookmarks',
			'packages',
			'progress',
			'recentBundles',
			'recentVerses',
			'settings',
			'verseRatings',
			'verses'
		]);
	});

	it('round-trips a recent bundle', async () => {
		await db.recentBundles.put({
			id: '5_krv:1-2-3',
			packageId: '5_krv',
			verseNos: [1, 2, 3],
			createdAt: 1000
		});
		const b = await db.recentBundles.get('5_krv:1-2-3');
		expect(b?.verseNos).toEqual([1, 2, 3]);
	});

	it('round-trips a verse', async () => {
		await db.verses.put({ package_id: '5_krv', no: 1, i: 1, title: 't', cite: 'c', w: 'w' });
		const v = await db.verses.get(['5_krv', 1]);
		expect(v?.title).toBe('t');
	});

	it('round-trips a progress row', async () => {
		await db.progress.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			bucket: 'new',
			enteredBucketAt: 1000,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		const p = await db.progress.get('5_krv:1');
		expect(p?.bucket).toBe('new');
	});

	it('round-trips an activity row', async () => {
		await db.activity.put({ dateKey: '2026-05-10' });
		const a = await db.activity.get('2026-05-10');
		expect(a?.dateKey).toBe('2026-05-10');
	});

	it('progress has packageId index for filtering', async () => {
		await db.progress.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			bucket: 'new',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		await db.progress.put({
			id: '60_krv:1',
			packageId: '60_krv',
			verseNo: 1,
			bucket: 'current',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		const fives = await db.progress.where('packageId').equals('5_krv').toArray();
		expect(fives).toHaveLength(1);
	});

	it('progress has bucket index for filtering', async () => {
		await db.progress.put({
			id: '5_krv:1',
			packageId: '5_krv',
			verseNo: 1,
			bucket: 'new',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		await db.progress.put({
			id: '5_krv:2',
			packageId: '5_krv',
			verseNo: 2,
			bucket: 'current',
			enteredBucketAt: 0,
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		});
		const news = await db.progress.where('bucket').equals('new').toArray();
		expect(news).toHaveLength(1);
	});
});
