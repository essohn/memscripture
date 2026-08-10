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

describe('markMismatchedWords is consistent with the score', () => {
	const TIM = '내가 이를 때까지 읽는 것과 권하는 것과 가르치는 것에 착념하라';

	// The reported bug. Positional comparison shifted every word after a merged
	// space, so the tail of a correct recitation was marked wrong while the
	// character-level score called the same input perfect.
	it('marks nothing wrong when only the spacing differs', () => {
		const merged = '내가 이를 때까지 읽는 것과 권하는것과 가르치는 것에 착념하라';
		expect(accuracyOf(TIM, merged)).toBe(1);
		expect(markMismatchedWords(TIM, merged).filter((m) => !m.ok)).toEqual([]);
	});

	it('marks nothing wrong for an added space', () => {
		const split = '내가 이를 때까지 읽는 것 과 권하는 것과 가르치는 것에 착념하라';
		expect(markMismatchedWords(TIM, split).filter((m) => !m.ok)).toEqual([]);
	});

	// The invariant the bug violated: a perfect score must never coexist with a
	// word marked wrong.
	it.each([
		'내가 이를 때까지 읽는 것과 권하는 것과 가르치는 것에 착념하라',
		'내가이를 때까지읽는 것과권하는 것과가르치는 것에착념하라',
		'  내가 이를 때까지 읽는 것과 권하는 것과 가르치는 것에 착념하라  '
	])('a 100%% attempt never marks a word wrong: %s', (attempt) => {
		expect(accuracyOf(TIM, attempt)).toBe(1);
		expect(markMismatchedWords(TIM, attempt).every((m) => m.ok)).toBe(true);
	});

	// A real error must still be caught, and must not smear onto its neighbours.
	it('marks only the word that is actually wrong', () => {
		const wrong = TIM.replace('가르치는', '가르키는');
		const marks = markMismatchedWords(TIM, wrong);
		expect(marks.filter((m) => !m.ok).map((m) => m.word)).toEqual(['가르치는']);
	});

	// Positional comparison could not do this: an inserted word shifted
	// everything after it.
	it('survives an inserted word without smearing', () => {
		const inserted = '내가 이를 때까지 읽는 것과 그리고 권하는 것과 가르치는 것에 착념하라';
		const wrong = markMismatchedWords(TIM, inserted).filter((m) => !m.ok);
		expect(wrong.length).toBeLessThanOrEqual(1);
	});

	it('marks a missing tail as wrong', () => {
		const marks = markMismatchedWords(TIM, '내가 이를 때까지 읽는');
		expect(marks.filter((m) => !m.ok).map((m) => m.word)).toEqual([
			'것과',
			'권하는',
			'것과',
			'가르치는',
			'것에',
			'착념하라'
		]);
	});
});

describe('marking is independent of alignment tie-breaking', () => {
	const TIM = '내가 이를 때까지 읽는 것과 권하는 것과 가르치는 것에 착념하라';

	// Reported twice from real use: a word plainly present in the attempt came
	// back marked wrong. Both times the cause was which minimum-cost path the
	// edit-distance backtrace happened to take, not the reader's typing.
	it('never marks a word the attempt contains in order', () => {
		const attempts = [
			TIM,
			TIM.replace('가르치는', '가르키는'),
			TIM.replace('착념하라', '착념하'),
			'내가 이를 때까지 읽는 것과 권하는 그리고 것과 가르치는 것에 착념하라',
			'내가이를 때까지읽는 것과권하는 것과가르치는 것에착념하라'
		];
		for (const attempt of attempts) {
			const marks = markMismatchedWords(TIM, attempt);
			for (const m of marks) {
				if (attempt.includes(m.word) && m.ok === false) {
					// Repeated words legitimately fail when one instance is missing,
					// so only flag words that appear as often as the verse needs.
					const needed = TIM.split(/\s+/).filter((w) => w === m.word).length;
					const present = attempt.split(/\s+/).filter((w) => w === m.word).length;
					expect(present, `"${m.word}" in "${attempt}"`).toBeLessThan(needed);
				}
			}
		}
	});

	// Repeated words must consume distinct positions rather than both matching
	// the same occurrence.
	it('matches repeated words against separate occurrences', () => {
		const missingOne = '내가 이를 때까지 읽는 것과 권하는 가르치는 것에 착념하라';
		const wrong = markMismatchedWords(TIM, missingOne).filter((m) => !m.ok);
		expect(wrong.map((m) => m.word)).toEqual(['것과']);
	});
});

describe('repeated words do not smear the marking', () => {
	// 느헤미야 8:8 repeats 그. Dropping the first one used to make a forward
	// search find the second, drag the cursor past everything between, and mark
	// five correct words wrong to account for one missing one.
	const NEH = '하나님의 율법책을 낭독하고 그 뜻을 해석하여 백성으로 그 낭독하는 것을 다 깨닫게 하매';

	it('marks only the dropped instance of a repeated word', () => {
		const dropped = '하나님의 율법책을 낭독하고 뜻을 해석하여 백성으로 그 낭독하는 것을 다 깨닫게 하매';
		const wrong = markMismatchedWords(NEH, dropped).filter((m) => !m.ok);
		expect(wrong.map((m) => m.word)).toEqual(['그']);
	});

	it('marks the later instance when that is the one dropped', () => {
		const dropped = '하나님의 율법책을 낭독하고 그 뜻을 해석하여 백성으로 낭독하는 것을 다 깨닫게 하매';
		expect(markMismatchedWords(NEH, dropped).filter((m) => !m.ok)).toHaveLength(1);
	});

	it('still accepts an inserted word without marking its neighbours', () => {
		const inserted = '하나님의 율법책을 낭독하고 그 참으로 뜻을 해석하여 백성으로 그 낭독하는 것을 다 깨닫게 하매';
		expect(markMismatchedWords(NEH, inserted).filter((m) => !m.ok)).toEqual([]);
	});

	it('marks nothing when the repeated verse is typed correctly', () => {
		expect(markMismatchedWords(NEH, NEH).filter((m) => !m.ok)).toEqual([]);
		expect(accuracyOf(NEH, NEH)).toBe(1);
	});
});

