import { describe, expect, it } from 'vitest';
import { hardestLevel, sortByDifficulty } from '../../src/lib/verses/difficultySort';

describe('hardestLevel', () => {
	// The scale runs 1 xHard → 5 xEasy, so the harder rating is the lower one.
	it('takes the harder of the two ratings', () => {
		expect(hardestLevel({ start: 4, full: 2 })).toBe(2);
		expect(hardestLevel({ start: 1, full: 5 })).toBe(1);
	});

	// They answer different questions — how hard to get going, how hard to
	// finish — and averaging would let a comfortable start hide a body nobody
	// can get through.
	it('does not average them', () => {
		expect(hardestLevel({ start: 5, full: 1 })).toBe(1);
	});

	it('uses whichever one exists', () => {
		expect(hardestLevel({ start: 3, full: null })).toBe(3);
		expect(hardestLevel({ start: null, full: 3 })).toBe(3);
	});

	it.each([[{ start: null, full: null }], [undefined], [null]])(
		'is null for an unrated verse (%o)',
		(rating) => {
			expect(hardestLevel(rating)).toBeNull();
		}
	);
});

describe('sortByDifficulty', () => {
	type V = { no: number; level: number | null };
	const order = (vs: V[]) =>
		sortByDifficulty(vs, (v) => ({ start: v.level as never, full: null })).map((v) => v.no);

	it('puts the hardest first', () => {
		expect(order([{ no: 1, level: 5 }, { no: 2, level: 1 }, { no: 3, level: 3 }])).toEqual([2, 3, 1]);
	});

	// Unrated verses carry no signal. On a package where most have never been
	// rated, sorting them to the top would bury the handful the reader marked
	// as hard — which is the entire point of the ordering.
	it('sends unrated verses to the bottom', () => {
		expect(order([{ no: 1, level: null }, { no: 2, level: 4 }, { no: 3, level: null }])).toEqual([
			2, 1, 3
		]);
	});

	// This sorts a list already in scripture or booklet order; scrambling ties
	// would make the result look arbitrary.
	it('keeps equal verses in the order they arrived', () => {
		expect(
			order([
				{ no: 7, level: 2 },
				{ no: 3, level: 2 },
				{ no: 9, level: 2 }
			])
		).toEqual([7, 3, 9]);
	});

	it('leaves an empty list alone', () => {
		expect(order([])).toEqual([]);
	});

	it('does not mutate its input', () => {
		const input = [{ no: 1, level: 5 }, { no: 2, level: 1 }];
		order(input);
		expect(input.map((v) => v.no)).toEqual([1, 2]);
	});
});
