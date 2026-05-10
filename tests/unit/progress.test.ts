import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getProgress,
	upsertProgress,
	pushRating,
	listProgressByPackage,
	listProgressByBucket,
	progressId
} from '../../src/lib/db/progress';
import type { VerseProgress } from '../../src/lib/types';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: '5_krv:1',
	packageId: '5_krv',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 1000,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('progress I/O', () => {
	it('progressId composes id correctly', () => {
		expect(progressId('60_krv', 17)).toBe('60_krv:17');
	});

	it('getProgress returns undefined for missing row', async () => {
		const p = await getProgress('5_krv', 1);
		expect(p).toBeUndefined();
	});

	it('upsertProgress writes and reads back', async () => {
		await upsertProgress(mk({ bucket: 'current' }));
		const p = await getProgress('5_krv', 1);
		expect(p?.bucket).toBe('current');
	});

	it('pushRating(cite) appends to citeRatings and caps at 10', async () => {
		await upsertProgress(mk());
		for (let i = 1; i <= 12; i++) {
			await pushRating('5_krv', 1, 'cite', (i % 4) + 1);
		}
		const p = await getProgress('5_krv', 1);
		expect(p?.citeRatings).toHaveLength(10);
		expect(p?.recallRatings).toHaveLength(0);
	});

	it('pushRating(recall) appends to recallRatings only', async () => {
		await upsertProgress(mk());
		await pushRating('5_krv', 1, 'recall', 3);
		const p = await getProgress('5_krv', 1);
		expect(p?.citeRatings).toEqual([]);
		expect(p?.recallRatings).toEqual([3]);
	});

	it('pushRating updates lastReviewedAt', async () => {
		await upsertProgress(mk({ lastReviewedAt: 0 }));
		const before = Date.now();
		await pushRating('5_krv', 1, 'recall', 3);
		const p = await getProgress('5_krv', 1);
		expect(p!.lastReviewedAt).toBeGreaterThanOrEqual(before);
	});

	it('pushRating is a no-op for missing progress row', async () => {
		await pushRating('nothing', 0, 'cite', 4);
		const p = await getProgress('nothing', 0);
		expect(p).toBeUndefined();
	});

	it('listProgressByPackage filters by packageId', async () => {
		await upsertProgress(mk({ id: '5_krv:1', packageId: '5_krv' }));
		await upsertProgress(mk({ id: '60_krv:1', packageId: '60_krv' }));
		const rows = await listProgressByPackage('5_krv');
		expect(rows).toHaveLength(1);
		expect(rows[0].packageId).toBe('5_krv');
	});

	it('listProgressByBucket filters by bucket', async () => {
		await upsertProgress(mk({ id: '5_krv:1', bucket: 'new' }));
		await upsertProgress(mk({ id: '5_krv:2', verseNo: 2, bucket: 'current' }));
		const news = await listProgressByBucket('new');
		expect(news).toHaveLength(1);
		expect(news[0].bucket).toBe('new');
	});

	it('pushRating throws on invalid score (out of 1-4)', async () => {
		await upsertProgress(mk());
		await expect(pushRating('5_krv', 1, 'cite', 0)).rejects.toThrow();
		await expect(pushRating('5_krv', 1, 'cite', 5)).rejects.toThrow();
		await expect(pushRating('5_krv', 1, 'cite', 1.5)).rejects.toThrow();
		await expect(pushRating('5_krv', 1, 'cite', NaN)).rejects.toThrow();
	});

	it('pushRating cap-at-10 keeps newest, drops oldest', async () => {
		await upsertProgress(mk());
		for (let i = 1; i <= 12; i++) {
			// scores 1,2,3,4,1,2,3,4,1,2,3,4
			await pushRating('5_krv', 1, 'cite', ((i - 1) % 4) + 1);
		}
		const p = await getProgress('5_krv', 1);
		// last 10 of [1,2,3,4,1,2,3,4,1,2,3,4] = [3,4,1,2,3,4,1,2,3,4]
		expect(p?.citeRatings).toEqual([3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
	});

	it('pushRating concurrent writes to same row do not lose ratings', async () => {
		await upsertProgress(mk());
		// Fire 5 concurrent writes — without transaction, several would be lost
		await Promise.all([
			pushRating('5_krv', 1, 'cite', 1),
			pushRating('5_krv', 1, 'cite', 2),
			pushRating('5_krv', 1, 'cite', 3),
			pushRating('5_krv', 1, 'cite', 4),
			pushRating('5_krv', 1, 'cite', 1)
		]);
		const p = await getProgress('5_krv', 1);
		expect(p?.citeRatings).toHaveLength(5);
	});
});
