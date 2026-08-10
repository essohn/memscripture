import { describe, expect, it } from 'vitest';
import {
	accuracyOf,
	fullDifficultyFor,
	levenshtein,
	markMismatchedWords,
	normalizeForGrading
} from '../../src/lib/memorize/grade';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

describe('normalizeForGrading', () => {
	it('drops spaces', () => {
		expect(normalizeForGrading('갈 길과')).toBe('갈길과');
	});

	// The only punctuation in the shipped corpus is 291 '*' verse markers,
	// two commas and one pair of parentheses — all of it noise for grading.
	it('drops the verse-boundary marker and punctuation', () => {
		expect(normalizeForGrading('부하게 되느니라 *여름에')).toBe('부하게되느니라여름에');
		expect(normalizeForGrading('가르쳐서, (마땅히)')).toBe('가르쳐서마땅히');
	});

	it('keeps hangul, latin and digits', () => {
		expect(normalizeForGrading('시편 23 AB')).toBe('시편23AB');
	});
});

describe('levenshtein', () => {
	it('is zero for identical strings', () => {
		expect(levenshtein('가나다', '가나다')).toBe(0);
	});

	it('counts substitutions, insertions and deletions', () => {
		expect(levenshtein('가나다', '가라다')).toBe(1);
		expect(levenshtein('가나다', '가나다라')).toBe(1);
		expect(levenshtein('가나다', '가다')).toBe(1);
	});

	it('handles an empty side', () => {
		expect(levenshtein('', '가나')).toBe(2);
		expect(levenshtein('가나', '')).toBe(2);
	});
});

describe('accuracyOf', () => {
	it('ignores spacing differences entirely', () => {
		expect(accuracyOf(VERSE, '그들에게 율례와 법도를 가르쳐서 마땅히 갈길과 할일을 그들에게 보이고')).toBe(1);
	});

	it('penalises a wrong word', () => {
		const a = accuracyOf(VERSE, VERSE.replace('가르쳐서', '가르치고'));
		expect(a).toBeLessThan(1);
		expect(a).toBeGreaterThan(0.9);
	});

	it('scores an empty attempt at zero', () => {
		expect(accuracyOf(VERSE, '')).toBe(0);
	});

	// Dividing by the longer side stops a rambling answer from scoring well
	// just because it contains the right text somewhere.
	it('does not reward padding the answer', () => {
		expect(accuracyOf('가나다', '가나다' + '라'.repeat(30))).toBeLessThan(0.2);
	});

	it('never returns a value outside 0..1', () => {
		expect(accuracyOf('', '')).toBe(1);
		expect(accuracyOf('가', '나')).toBeGreaterThanOrEqual(0);
	});
});

describe('fullDifficultyFor', () => {
	it.each([
		[1, 5],
		[0.99, 4],
		[0.95, 4],
		[0.9, 3],
		[0.85, 3],
		[0.8, 2],
		[0.7, 2],
		[0.69, 1],
		[0, 1]
	])('maps accuracy %s to level %s', (accuracy, level) => {
		expect(fullDifficultyFor(accuracy)).toBe(level);
	});
});

describe('markMismatchedWords', () => {
	// Marking is per word even though the score is per character: a
	// character-level diff highlights fragments of syllables, which is
	// unreadable, and "which words did I miss" is the useful question.
	it('marks only the words that differ', () => {
		const marks = markMismatchedWords('갈 길과 할 일을', '갈 길은 할 일을');
		expect(marks).toEqual([
			{ word: '갈', ok: true },
			{ word: '길과', ok: false },
			{ word: '할', ok: true },
			{ word: '일을', ok: true }
		]);
	});

	it('compares words under the same normalization', () => {
		const marks = markMismatchedWords('가르쳐서, 마땅히', '가르쳐서 마땅히');
		expect(marks.every((m) => m.ok)).toBe(true);
	});

	it('marks missing trailing words as wrong rather than dropping them', () => {
		const marks = markMismatchedWords('갈 길과 할 일을', '갈 길과');
		expect(marks.map((m) => m.ok)).toEqual([true, true, false, false]);
	});
});
