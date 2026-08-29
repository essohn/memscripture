import { describe, expect, it } from 'vitest';
import { bundlesFromItems } from '../../src/lib/quiz/recentFromQuiz';
import type { QuizItem } from '../../src/lib/quiz/session';

const item = (packageId: string, verseNo: number): QuizItem => ({
	id: `${packageId}:${verseNo}`,
	packageId,
	verseNo,
	title: `제목 ${verseNo}`,
	cite: `창세기 1 : ${verseNo}`,
	w: `본문 ${verseNo}`
});

describe('bundlesFromItems', () => {
	it('makes no bundle out of nothing', () => {
		expect(bundlesFromItems([])).toEqual([]);
	});

	it('gathers one package into one bundle', () => {
		expect(bundlesFromItems([item('a_krv', 3), item('a_krv', 1)])).toEqual([
			{ packageId: 'a_krv', verseNos: [3, 1] }
		]);
	});

	// recordRecentBundle takes a single packageId, and an 암송 DAY can span
	// several — collapsing them into one bundle would file b_krv's verse
	// numbers under a_krv and the home screen would resolve the wrong verses
	// or none at all.
	it('splits verses from different packages into their own bundles', () => {
		const bundles = bundlesFromItems([
			item('a_krv', 3),
			item('b_krv', 7),
			item('a_krv', 1),
			item('b_krv', 2)
		]);
		expect(bundles).toEqual([
			{ packageId: 'a_krv', verseNos: [3, 1] },
			{ packageId: 'b_krv', verseNos: [7, 2] }
		]);
	});
});
