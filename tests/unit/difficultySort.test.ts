import { describe, expect, it } from 'vitest';
import { sortByDifficulty } from '../../src/lib/verses/difficultySort';

describe('sortByDifficulty', () => {
	type V = { no: number; start: number | null; full: number | null };
	const order = (vs: V[]) =>
		sortByDifficulty(vs, (v) => ({
			start: v.start as never,
			full: v.full as never
		})).map((v) => v.no);

	// The scale runs 0 Impossible → 5 xEasy, so "hardest first" is ascending.
	it('leads with the hardest 시작 난이도', () => {
		expect(
			order([
				{ no: 1, start: 5, full: 5 },
				{ no: 2, start: 1, full: 5 },
				{ no: 3, start: 3, full: 5 }
			])
		).toEqual([2, 3, 1]);
	});

	it('breaks a 시작 tie with the hardest 전체 난이도', () => {
		expect(
			order([
				{ no: 1, start: 3, full: 5 },
				{ no: 2, start: 3, full: 1 },
				{ no: 3, start: 3, full: 3 }
			])
		).toEqual([2, 3, 1]);
	});

	// The whole point of the two keys. Collapsing them to whichever is harder
	// would tie these two verses, leaving the 시작 column reading 5, 1 — which
	// is what made the exported sheet look unsorted.
	it('does not let a brutal 전체 outrank a harder 시작', () => {
		expect(
			order([
				{ no: 1, start: 5, full: 1 },
				{ no: 2, start: 1, full: 5 }
			])
		).toEqual([2, 1]);
	});

	// An unrated 시작 carries no signal. On a package where most verses have
	// never been rated, sorting them to the top would bury the handful the
	// reader actually marked as hard — which is the entire point of the order.
	it('sends a verse with no 시작 rating below every rated one', () => {
		expect(
			order([
				{ no: 1, start: null, full: 1 },
				{ no: 2, start: 5, full: 5 }
			])
		).toEqual([2, 1]);
	});

	it('still ranks the unrated-시작 verses against each other by 전체', () => {
		expect(
			order([
				{ no: 1, start: null, full: 4 },
				{ no: 2, start: null, full: null },
				{ no: 3, start: null, full: 2 }
			])
		).toEqual([3, 1, 2]);
	});

	it('leaves the wholly unrated at the bottom', () => {
		expect(
			order([
				{ no: 1, start: null, full: null },
				{ no: 2, start: 4, full: 4 },
				{ no: 3, start: null, full: null }
			])
		).toEqual([2, 1, 3]);
	});

	// This sorts a list already in scripture or booklet order; scrambling ties
	// would make the result look arbitrary.
	it('keeps verses rated alike in the order they arrived', () => {
		expect(
			order([
				{ no: 7, start: 2, full: 3 },
				{ no: 3, start: 2, full: 3 },
				{ no: 9, start: 2, full: 3 }
			])
		).toEqual([7, 3, 9]);
	});

	it('leaves an empty list alone', () => {
		expect(order([])).toEqual([]);
	});

	it('does not mutate its input', () => {
		const input: V[] = [
			{ no: 1, start: 5, full: 5 },
			{ no: 2, start: 1, full: 1 }
		];
		order(input);
		expect(input.map((v) => v.no)).toEqual([1, 2]);
	});
});
