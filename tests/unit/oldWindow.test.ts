import { describe, it, expect } from 'vitest';
import { priorityScore, selectOldActiveWindow } from '../../src/lib/srs/oldWindow';
import type { VerseProgress } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'old',
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('priorityScore', () => {
	it('returns 0 for empty rating history (highest priority)', () => {
		expect(priorityScore(mk())).toBe(0);
	});

	it('returns average of last-5 cite + last-5 recall ratings', () => {
		const p = mk({ citeRatings: [4, 4, 4, 4, 4], recallRatings: [4, 4, 4, 4, 4] });
		expect(priorityScore(p)).toBe(4);
	});

	it('uses only last 5 of each axis', () => {
		const p = mk({
			citeRatings: [1, 1, 1, 1, 1, 4, 4, 4, 4, 4],
			recallRatings: [1, 1, 1, 1, 1, 4, 4, 4, 4, 4]
		});
		expect(priorityScore(p)).toBe(4);
	});

	it('mixed ratings produce intermediate score', () => {
		const p = mk({ citeRatings: [1, 2, 3, 4], recallRatings: [4, 3, 2, 1] });
		expect(priorityScore(p)).toBeCloseTo(2.5, 5);
	});

	it('cite-only history scores against just cite axis', () => {
		const p = mk({ citeRatings: [2, 2, 2], recallRatings: [] });
		expect(priorityScore(p)).toBe(2);
	});
});

describe('selectOldActiveWindow', () => {
	it('returns at most 12 entries', () => {
		const cards = Array.from({ length: 30 }, (_, i) =>
			mk({ id: `pkg:${i}`, verseNo: i, citeRatings: [3], recallRatings: [3] })
		);
		expect(selectOldActiveWindow(cards)).toHaveLength(12);
	});

	it('returns all cards when fewer than 12', () => {
		const cards = Array.from({ length: 5 }, (_, i) => mk({ id: `pkg:${i}`, verseNo: i }));
		expect(selectOldActiveWindow(cards)).toHaveLength(5);
	});

	it('returns empty array for empty input', () => {
		expect(selectOldActiveWindow([])).toEqual([]);
	});

	it('orders by priority ascending (lowest score first = neediest)', () => {
		const a = mk({ id: 'pkg:1', citeRatings: [4, 4], recallRatings: [4, 4] });
		const b = mk({ id: 'pkg:2', citeRatings: [1, 1], recallRatings: [1, 1] });
		const c = mk({ id: 'pkg:3', citeRatings: [], recallRatings: [] });
		const result = selectOldActiveWindow([a, b, c]);
		expect(result.map((p) => p.id)).toEqual(['pkg:3', 'pkg:2', 'pkg:1']);
	});

	it('breaks ties by oldest lastReviewedAt first', () => {
		const a = mk({ id: 'pkg:1', citeRatings: [3], recallRatings: [3], lastReviewedAt: 2000 });
		const b = mk({ id: 'pkg:2', citeRatings: [3], recallRatings: [3], lastReviewedAt: 1000 });
		const result = selectOldActiveWindow([a, b]);
		expect(result.map((p) => p.id)).toEqual(['pkg:2', 'pkg:1']);
	});

	it('does not mutate input array', () => {
		const cards = [
			mk({ id: 'a', citeRatings: [4] }),
			mk({ id: 'b', citeRatings: [1] })
		];
		const before = cards.map((c) => c.id);
		selectOldActiveWindow(cards);
		expect(cards.map((c) => c.id)).toEqual(before);
	});
});
