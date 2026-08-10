import type { Bucket, VerseProgress } from '$lib/types';

export const NEW_DURATION_DAYS = 7;
export const CURRENT_DURATION_DAYS = 42;

/** Consecutive recent reviews inspected when judging mastery. */
export const MASTERY_REVIEWS = 4;
/** Lowest rating that still counts as passing (the scale runs 1–4). */
export const MASTERY_MIN_SCORE = 3;
/** How long a mastered verse rests before it is verified once more. */
export const RECHECK_AFTER_DAYS = 90;

const DAY_MS = 86_400_000;

/** Were the last `MASTERY_REVIEWS` entries all passing? Too short a history
 *  is not evidence of mastery, so it fails. */
function recentlyStrong(ratings: number[]): boolean {
	if (ratings.length < MASTERY_REVIEWS) return false;
	return ratings.slice(-MASTERY_REVIEWS).every((r) => r >= MASTERY_MIN_SCORE);
}

/**
 * `new` and `current` graduate on time served; `old` graduates on evidence.
 *
 * The asymmetry is deliberate. Time in a bucket is a reasonable proxy for
 * "has been exposed to this enough", which is all the earlier stages claim.
 * `mastered` claims the reader knows the verse, and the only thing that
 * supports that claim is how they have actually been scoring it.
 *
 * Both axes must qualify on their own last four: `citeRatings` covers
 * recalling the opening and `recallRatings` the whole verse, and clearing one
 * while failing the other is not mastery.
 */
export function shouldGraduate(p: VerseProgress): boolean {
	if (p.bucket === 'new') return p.daysActiveInBucket >= NEW_DURATION_DAYS;
	if (p.bucket === 'current') return p.daysActiveInBucket >= CURRENT_DURATION_DAYS;
	if (p.bucket === 'old') {
		return recentlyStrong(p.citeRatings) && recentlyStrong(p.recallRatings);
	}
	return false;
}

export function advanceBucket(p: VerseProgress): VerseProgress {
	const nextBucket: Bucket =
		p.bucket === 'new'
			? 'current'
			: p.bucket === 'current'
				? 'old'
				: p.bucket === 'old'
					? 'mastered'
					: p.bucket;
	if (nextBucket === p.bucket) return p;
	return {
		...p,
		bucket: nextBucket,
		enteredBucketAt: Date.now(),
		daysActiveInBucket: 0
	};
}

/**
 * Is a mastered verse due to be verified again?
 *
 * Memorized text decays, and mastered verses are kept out of the queue, so
 * without this one check a verse would never be tested again after graduating.
 *
 * The due date needs no new field: advanceBucket stamps `enteredBucketAt` on
 * every transition, so for a mastered verse that stamp *is* the graduation
 * moment. A missing or zero stamp — progress written before this existed —
 * reads as due, so such a verse gets verified rather than trusted forever.
 */
export function isRecheckDue(p: VerseProgress, now: number): boolean {
	if (p.bucket !== 'mastered') return false;
	if (!p.enteredBucketAt) return true;
	return now - p.enteredBucketAt >= RECHECK_AFTER_DAYS * DAY_MS;
}

/**
 * Applies the outcome of a re-check: passing restarts the rest period, failing
 * returns the verse to `old`.
 *
 * The rating history is left untouched, which matters on the failing path —
 * the failing score sits inside the last-four window, so a demoted verse
 * cannot immediately re-graduate on the four passes that came before it.
 */
export function applyRecheckResult(
	p: VerseProgress,
	score: number,
	now: number
): VerseProgress {
	const passed = score >= MASTERY_MIN_SCORE;
	return {
		...p,
		bucket: passed ? 'mastered' : 'old',
		enteredBucketAt: now,
		daysActiveInBucket: 0
	};
}
