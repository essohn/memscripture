import { describe, expect, it } from 'vitest';
import { RANKS, rankOf } from '../../src/lib/arcade/score';

describe('rankOf', () => {
	it('gives the top rank only to a clean sweep', () => {
		expect(rankOf(10, 10)).toBe('S');
		expect(rankOf(9, 10)).not.toBe('S');
	});

	it('falls through the letters as the score falls', () => {
		const grades = [rankOf(9, 10), rankOf(7, 10), rankOf(5, 10), rankOf(1, 10)];
		expect(grades).toEqual(['A', 'B', 'C', 'D']);
	});

	// A rank is a summary of a session, and a session of nothing has none to
	// summarise. Returning the bottom letter would call an empty run a failure.
	it('has no rank for a session with no rounds', () => {
		expect(rankOf(0, 0)).toBeNull();
	});

	it('only ever answers with a rank it declares', () => {
		for (let passed = 0; passed <= 12; passed++) {
			const rank = rankOf(passed, 12);
			expect(RANKS).toContain(rank);
		}
	});
});
