import { describe, it, expect } from 'vitest';
import { buildSuggestions } from '../../src/lib/srs/suggestions';
import type { VerseProgress } from '../../src/lib/types';
import type { StoredVerse } from '../../src/lib/db/local';

const verse = (no: number, packageId = 'pkg'): StoredVerse => ({
	package_id: packageId,
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

describe('buildSuggestions', () => {
	it('returns 2 suggestions when New is empty and ≥2 unmemorized verses exist', () => {
		const verses = [verse(1), verse(2), verse(3)];
		const result = buildSuggestions([], verses);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ packageId: 'pkg', verseNo: 1 });
		expect(result[1]).toEqual({ packageId: 'pkg', verseNo: 2 });
	});

	it('returns 1 suggestion when one New slot is filled', () => {
		const verses = [verse(1), verse(2), verse(3)];
		const result = buildSuggestions([progress(1, 'new')], verses);
		expect(result).toHaveLength(1);
		expect(result[0].verseNo).toBe(2);
	});

	it('returns 0 suggestions when both New slots are filled', () => {
		const verses = [verse(1), verse(2), verse(3)];
		const result = buildSuggestions([progress(1, 'new'), progress(2, 'new')], verses);
		expect(result).toHaveLength(0);
	});

	it('returns 0 suggestions when package is fully memorized', () => {
		const verses = [verse(1)];
		const result = buildSuggestions([progress(1, 'old')], verses);
		expect(result).toHaveLength(0);
	});

	it('returns 1 suggestion when only 1 unmemorized verse remains', () => {
		const verses = [verse(1), verse(2)];
		const result = buildSuggestions([progress(1, 'current')], verses);
		expect(result).toHaveLength(1);
		expect(result[0].verseNo).toBe(2);
	});

	it('returns 0 suggestions when packageVerses is empty', () => {
		expect(buildSuggestions([], [])).toEqual([]);
	});

	it('two suggestions are always distinct verses', () => {
		const verses = [verse(1), verse(2), verse(3), verse(4)];
		const result = buildSuggestions([], verses);
		expect(result).toHaveLength(2);
		const ids = new Set(result.map((s) => s.verseNo));
		expect(ids.size).toBe(2);
	});

	it('uses the package id from packageVerses', () => {
		const verses = [verse(1, 'other_pkg')];
		const result = buildSuggestions([], verses);
		expect(result[0].packageId).toBe('other_pkg');
	});
});
