import { describe, it, expect } from 'vitest';
import { applyGraduations } from '../../src/lib/srs/orchestrate';
import { NEW_DURATION_DAYS, CURRENT_DURATION_DAYS } from '../../src/lib/srs/buckets';
import type { VerseProgress } from '../../src/lib/types';

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

describe('applyGraduations', () => {
	it('returns empty result for empty input', () => {
		const result = applyGraduations([]);
		expect(result.graduated).toEqual([]);
		expect(result.current).toEqual([]);
	});

	it('returns all in current unchanged when nothing graduates', () => {
		const input = [
			mk({ id: 'pkg:1', bucket: 'new', daysActiveInBucket: 3 }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'current', daysActiveInBucket: 10 })
		];
		const result = applyGraduations(input);
		expect(result.graduated).toEqual([]);
		expect(result.current).toEqual(input);
	});

	it('graduates a New card that reached threshold', () => {
		const input = [mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS })];
		const result = applyGraduations(input);
		expect(result.graduated).toHaveLength(1);
		expect(result.graduated[0].bucket).toBe('current');
		expect(result.current).toHaveLength(1);
		expect(result.current[0].bucket).toBe('current');
	});

	it('graduates a Current card that reached threshold', () => {
		const input = [mk({ bucket: 'current', daysActiveInBucket: CURRENT_DURATION_DAYS })];
		const result = applyGraduations(input);
		expect(result.graduated).toHaveLength(1);
		expect(result.graduated[0].bucket).toBe('old');
		expect(result.current[0].bucket).toBe('old');
	});

	it('preserves order in current; graduated only contains changed cards', () => {
		const input = [
			mk({ id: 'pkg:1', bucket: 'new', daysActiveInBucket: 0 }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS }),
			mk({ id: 'pkg:3', verseNo: 3, bucket: 'current', daysActiveInBucket: 10 })
		];
		const result = applyGraduations(input);
		expect(result.current.map((p) => p.id)).toEqual(['pkg:1', 'pkg:2', 'pkg:3']);
		expect(result.graduated.map((p) => p.id)).toEqual(['pkg:2']);
		expect(result.current[1].bucket).toBe('current'); // graduated in place
	});

	it('does not mutate input array or its objects', () => {
		const original = mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS });
		const input = [original];
		const snapshot = JSON.parse(JSON.stringify(original));
		applyGraduations(input);
		expect(input[0]).toEqual(snapshot);
	});
});
