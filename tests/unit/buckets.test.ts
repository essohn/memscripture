import { describe, it, expect } from 'vitest';
import {
	NEW_DURATION_DAYS,
	CURRENT_DURATION_DAYS,
	MASTERY_REVIEWS,
	MASTERY_MIN_SCORE,
	RECHECK_AFTER_DAYS,
	shouldGraduate,
	advanceBucket,
	isRecheckDue,
	applyRecheckResult
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

	// This used to assert old was terminal, which encoded the gap rather than a
	// decision: nothing ever assigned 'mastered', so the bucket and the
	// scheduler's handling of it were unreachable.
	it('old advances to mastered', () => {
		const result = advanceBucket(mk({ bucket: 'old', daysActiveInBucket: 100 }));
		expect(result.bucket).toBe('mastered');
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

const DAY = 86_400_000;
/** An old-bucket verse whose last reviews are all comfortably passing. */
const strong = (over: Partial<VerseProgress> = {}) =>
	mk({
		bucket: 'old',
		citeRatings: [3, 3, 3, 3],
		recallRatings: [4, 3, 4, 3],
		...over
	});

describe('graduating out of old', () => {
	it('graduates on four passing reviews across both axes', () => {
		expect(shouldGraduate(strong())).toBe(true);
	});

	// Mastery of the opening is not mastery of the verse. Each axis is judged
	// on its own last four.
	it('does not graduate when only one axis qualifies', () => {
		expect(shouldGraduate(strong({ recallRatings: [4, 2, 4, 3] }))).toBe(false);
		expect(shouldGraduate(strong({ citeRatings: [2, 3, 3, 3] }))).toBe(false);
	});

	it('does not graduate on too few reviews', () => {
		expect(shouldGraduate(strong({ citeRatings: [3, 3, 3] }))).toBe(false);
		expect(shouldGraduate(strong({ citeRatings: [], recallRatings: [] }))).toBe(false);
	});

	// Only the last four count, so an old failure does not hold a verse back
	// and a recent one is not excused by older passes.
	it('looks only at the last four', () => {
		expect(shouldGraduate(strong({ citeRatings: [1, 1, 3, 3, 3, 3] }))).toBe(true);
		expect(shouldGraduate(strong({ citeRatings: [4, 4, 4, 4, 2] }))).toBe(false);
	});

	it('advances old to mastered and stamps the moment', () => {
		const before = Date.now();
		const next = advanceBucket(strong());
		expect(next.bucket).toBe('mastered');
		expect(next.enteredBucketAt).toBeGreaterThanOrEqual(before);
	});

	it('leaves a mastered verse alone', () => {
		const m = mk({ bucket: 'mastered' });
		expect(shouldGraduate(m)).toBe(false);
		expect(advanceBucket(m)).toBe(m);
	});

	it('exposes its thresholds', () => {
		expect(MASTERY_REVIEWS).toBe(4);
		expect(MASTERY_MIN_SCORE).toBe(3);
		expect(RECHECK_AFTER_DAYS).toBe(90);
	});
});

describe('re-checking a mastered verse', () => {
	const now = 1_000_000_000_000;
	const mastered = (enteredBucketAt: number) => mk({ bucket: 'mastered', enteredBucketAt });

	it('is not due inside the window', () => {
		expect(isRecheckDue(mastered(now - 89 * DAY), now)).toBe(false);
	});

	it('is due once the window has passed', () => {
		expect(isRecheckDue(mastered(now - 91 * DAY), now)).toBe(true);
	});

	// Progress written before this change has no meaningful stamp; verify such
	// a verse rather than trusting it forever.
	it('is due when the stamp is missing', () => {
		expect(isRecheckDue(mk({ bucket: 'mastered', enteredBucketAt: 0 }), now)).toBe(true);
	});

	it('never applies to other buckets', () => {
		expect(isRecheckDue(mk({ bucket: 'old', enteredBucketAt: 0 }), now)).toBe(false);
	});

	it('keeps mastery on a pass and restarts the clock', () => {
		const p = mastered(now - 100 * DAY);
		const next = applyRecheckResult(p, 3, now);
		expect(next.bucket).toBe('mastered');
		expect(next.enteredBucketAt).toBe(now);
		expect(isRecheckDue(next, now)).toBe(false);
	});

	it('demotes to old on a failed re-check', () => {
		const next = applyRecheckResult(mastered(now - 100 * DAY), 2, now);
		expect(next.bucket).toBe('old');
		expect(next.enteredBucketAt).toBe(now);
	});

	// The failing score is inside the last-four window, so a demoted verse
	// cannot immediately re-graduate on the four passes that preceded it.
	it('does not let a demoted verse re-graduate at once', () => {
		const p = mk({
			bucket: 'mastered',
			enteredBucketAt: now - 100 * DAY,
			citeRatings: [3, 3, 3, 3, 2],
			recallRatings: [3, 3, 3, 3, 2]
		});
		expect(shouldGraduate(applyRecheckResult(p, 2, now))).toBe(false);
	});
});

