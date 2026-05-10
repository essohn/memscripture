import type { Bucket, VerseProgress } from '$lib/types';

export const NEW_DURATION_DAYS = 7;
export const CURRENT_DURATION_DAYS = 42;

export function shouldGraduate(p: VerseProgress): boolean {
	if (p.bucket === 'new') return p.daysActiveInBucket >= NEW_DURATION_DAYS;
	if (p.bucket === 'current') return p.daysActiveInBucket >= CURRENT_DURATION_DAYS;
	return false;
}

export function advanceBucket(p: VerseProgress): VerseProgress {
	const nextBucket: Bucket =
		p.bucket === 'new' ? 'current' : p.bucket === 'current' ? 'old' : p.bucket;
	if (nextBucket === p.bucket) return p;
	return {
		...p,
		bucket: nextBucket,
		enteredBucketAt: Date.now(),
		daysActiveInBucket: 0
	};
}
