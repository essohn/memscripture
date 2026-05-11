import { describe, it, expect } from 'vitest';
import { buildTodayQueue } from '../../src/lib/srs/scheduler';
import type { VerseProgress, DailyActivity } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

const activity = (count: number): DailyActivity[] =>
	Array.from({ length: count }, (_, i) => ({
		dateKey: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`
	}));

describe('buildTodayQueue', () => {
	it('returns empty queue for empty progress', () => {
		expect(buildTodayQueue([], [])).toEqual([]);
	});

	it('includes all New cards every day', () => {
		const news = [
			mk({ id: 'pkg:1', verseNo: 1, bucket: 'new' }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'new' })
		];
		const queue = buildTodayQueue(news, activity(0));
		expect(queue.filter((p) => p.bucket === 'new')).toHaveLength(2);
	});

	it('rotates Current cards across a 3-day cycle', () => {
		const currents = Array.from({ length: 12 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, bucket: 'current' })
		);
		const day0 = buildTodayQueue(currents, activity(0)).filter((p) => p.bucket === 'current');
		const day1 = buildTodayQueue(currents, activity(1)).filter((p) => p.bucket === 'current');
		const day2 = buildTodayQueue(currents, activity(2)).filter((p) => p.bucket === 'current');
		// each day surfaces a non-empty subset
		expect(day0.length).toBeGreaterThan(0);
		expect(day1.length).toBeGreaterThan(0);
		expect(day2.length).toBeGreaterThan(0);
		// over 3 days, every card appears at least once
		const seen = new Set([
			...day0.map((p) => p.id),
			...day1.map((p) => p.id),
			...day2.map((p) => p.id)
		]);
		expect(seen.size).toBe(12);
	});

	it('Current rotation is deterministic per id (same day → same set)', () => {
		const currents = Array.from({ length: 12 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, bucket: 'current' })
		);
		const a = buildTodayQueue(currents, activity(5));
		const b = buildTodayQueue(currents, activity(5));
		expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
	});

	it('surfaces 1-2 Old cards per day from active window', () => {
		const olds = Array.from({ length: 30 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, bucket: 'old' })
		);
		const queue = buildTodayQueue(olds, activity(0));
		const oldInQueue = queue.filter((p) => p.bucket === 'old');
		expect(oldInQueue.length).toBeGreaterThanOrEqual(1);
		expect(oldInQueue.length).toBeLessThanOrEqual(2);
	});

	it('surfaces no Old when there are no Old cards', () => {
		const queue = buildTodayQueue([mk({ bucket: 'new' })], []);
		expect(queue.filter((p) => p.bucket === 'old')).toHaveLength(0);
	});

	it('excludes Mastered cards entirely', () => {
		const queue = buildTodayQueue([mk({ id: 'pkg:1', bucket: 'mastered' })], []);
		expect(queue).toHaveLength(0);
	});

	it('mixes New, Current, and Old buckets in one queue', () => {
		const mix = [
			mk({ id: 'pkg:1', verseNo: 1, bucket: 'new' }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'current' }),
			mk({ id: 'pkg:3', verseNo: 3, bucket: 'old' }),
			mk({ id: 'pkg:4', verseNo: 4, bucket: 'mastered' })
		];
		const queue = buildTodayQueue(mix, []);
		const buckets = new Set(queue.map((p) => p.bucket));
		expect(buckets.has('new')).toBe(true);
		expect(buckets.has('old')).toBe(true);
		expect(buckets.has('mastered')).toBe(false);
	});
});
