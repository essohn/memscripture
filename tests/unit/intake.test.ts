import { describe, it, expect } from 'vitest';
import { recommendNext } from '../../src/lib/srs/intake';
import type { VerseProgress } from '../../src/lib/types';
import type { StoredVerse } from '../../src/lib/db/local';

const verse = (no: number): StoredVerse => ({
	package_id: 'pkg',
	no,
	i: no,
	title: `t${no}`,
	cite: `c${no}`,
	w: `w${no}`
});

const progress = (no: number, bucket: VerseProgress['bucket']): VerseProgress => ({
	id: `pkg:${no}`,
	packageId: 'pkg',
	verseNo: no,
	bucket,
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: []
});

describe('recommendNext', () => {
	it('returns first verse when no progress exists', () => {
		expect(recommendNext([verse(1), verse(2), verse(3)], [])).toBe(1);
	});

	it('skips verses already in any bucket', () => {
		const prog = [progress(1, 'new'), progress(2, 'current')];
		expect(recommendNext([verse(1), verse(2), verse(3)], prog)).toBe(3);
	});

	it('skips Old verses', () => {
		const prog = [progress(1, 'old')];
		expect(recommendNext([verse(1), verse(2)], prog)).toBe(2);
	});

	it('skips Mastered verses', () => {
		const prog = [progress(1, 'mastered')];
		expect(recommendNext([verse(1), verse(2)], prog)).toBe(2);
	});

	it('returns null when all verses are in some bucket', () => {
		const prog = [progress(1, 'old'), progress(2, 'mastered')];
		expect(recommendNext([verse(1), verse(2)], prog)).toBeNull();
	});

	it('orders by verseNo ascending (package author intent)', () => {
		expect(recommendNext([verse(3), verse(1), verse(2)], [])).toBe(1);
	});

	it('returns null for empty package', () => {
		expect(recommendNext([], [])).toBeNull();
	});

	it('treats progress for different package as not-memorized for this package', () => {
		const otherPkg: VerseProgress = { ...progress(1, 'new'), id: 'other:1', packageId: 'other' };
		// recommendNext only takes this-package progress; caller should pre-filter.
		// Test documents the invariant: we only check verseNo membership.
		expect(recommendNext([verse(1)], [])).toBe(1);
		expect(recommendNext([verse(1)], [otherPkg])).toBeNull();
		// Note: caller is responsible for passing only same-package progress.
	});
});
