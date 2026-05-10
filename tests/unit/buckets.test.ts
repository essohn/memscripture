import { describe, it, expect } from 'vitest';
import {
	NEW_DURATION_DAYS,
	CURRENT_DURATION_DAYS,
	shouldGraduate,
	advanceBucket
} from '../../src/lib/srs/buckets';
import type { VerseProgress } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 1000,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('shouldGraduate', () => {
	it('returns true when New card has reached NEW_DURATION_DAYS', () => {
		expect(
			shouldGraduate(mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS }))
		).toBe(true);
	});

	it('returns false when New card is below threshold', () => {
		expect(
			shouldGraduate(mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS - 1 }))
		).toBe(false);
	});

	it('returns true when Current card has reached CURRENT_DURATION_DAYS', () => {
		expect(
			shouldGraduate(mk({ bucket: 'current', daysActiveInBucket: CURRENT_DURATION_DAYS }))
		).toBe(true);
	});

	it('returns false when Current card is below threshold', () => {
		expect(
			shouldGraduate(mk({ bucket: 'current', daysActiveInBucket: CURRENT_DURATION_DAYS - 1 }))
		).toBe(false);
	});

	it('returns false for Old (no auto-graduation)', () => {
		expect(shouldGraduate(mk({ bucket: 'old', daysActiveInBucket: 9999 }))).toBe(false);
	});

	it('returns false for Mastered', () => {
		expect(shouldGraduate(mk({ bucket: 'mastered', daysActiveInBucket: 9999 }))).toBe(false);
	});
});

describe('advanceBucket', () => {
	it('new → current', () => {
		const result = advanceBucket(mk({ bucket: 'new', daysActiveInBucket: 7 }));
		expect(result.bucket).toBe('current');
	});

	it('current → old', () => {
		const result = advanceBucket(mk({ bucket: 'current', daysActiveInBucket: 42 }));
		expect(result.bucket).toBe('old');
	});

	it('resets daysActiveInBucket to 0 on transition', () => {
		const result = advanceBucket(mk({ bucket: 'new', daysActiveInBucket: 7 }));
		expect(result.daysActiveInBucket).toBe(0);
	});

	it('updates enteredBucketAt to now on transition', () => {
		const before = Date.now();
		const result = advanceBucket(mk({ bucket: 'new', enteredBucketAt: 1000 }));
		expect(result.enteredBucketAt).toBeGreaterThanOrEqual(before);
	});

	it('does not mutate input', () => {
		const input = mk({ bucket: 'new', daysActiveInBucket: 7 });
		const copy = { ...input };
		advanceBucket(input);
		expect(input).toEqual(copy);
	});

	it('old returns unchanged (no further advance)', () => {
		const input = mk({ bucket: 'old', daysActiveInBucket: 100 });
		const result = advanceBucket(input);
		expect(result.bucket).toBe('old');
		expect(result).toBe(input); // same reference, not advanced
	});

	it('mastered returns unchanged', () => {
		const input = mk({ bucket: 'mastered' });
		const result = advanceBucket(input);
		expect(result.bucket).toBe('mastered');
	});

	it('preserves citeRatings and recallRatings on transition', () => {
		const input = mk({
			bucket: 'new',
			citeRatings: [3, 4, 2],
			recallRatings: [2, 3, 4]
		});
		const result = advanceBucket(input);
		expect(result.citeRatings).toEqual([3, 4, 2]);
		expect(result.recallRatings).toEqual([2, 3, 4]);
	});
});
