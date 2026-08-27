import { describe, expect, it } from 'vitest';
import {
	SUGGEST_MAX_PER_VERSE,
	SUGGEST_WINDOW,
	suggestedMarks
} from '../../src/lib/memorize/missStats';

/** Records newest-first, the order listChecks returns. */
const checks = (...missed: (number[] | undefined)[]) => missed.map((m) => ({ missed: m }));

describe('suggestedMarks', () => {
	it('proposes nothing without history', () => {
		expect(suggestedMarks([], 11)).toEqual(new Set());
	});

	// One slip is a typo or a bad morning, not a weak spot.
	it('needs two misses, not one', () => {
		expect(suggestedMarks(checks([3]), 11)).toEqual(new Set());
		expect(suggestedMarks(checks([3], [3]), 11)).toEqual(new Set([3]));
	});

	// The window is what makes a suggestion decay: get better at the verse and
	// the old misses fall out the back, with nothing having to expire them.
	it('ignores a miss older than the window', () => {
		const history = checks([1], [], [], [], [], [1]);
		expect(history).toHaveLength(SUGGEST_WINDOW + 1);
		expect(suggestedMarks(history, 11)).toEqual(new Set());
	});

	// Absent is not the same as clean. Records written before this feature
	// measured nothing; counting them as successes would let a long history
	// suppress the suggestions the new records earn.
	it('lets a pre-feature record fill the window without contributing', () => {
		expect(suggestedMarks(checks([2], undefined, [2]), 11)).toEqual(new Set([2]));
	});

	// One attempt cannot miss the same word twice — markMismatchedWords returns
	// one entry per position, so a repeat would be a caller bug.
	it('counts a repeated index inside one record once', () => {
		expect(suggestedMarks(checks([4, 4]), 11)).toEqual(new Set());
	});

	// An OYO verse can be edited shorter underneath its own history.
	it('drops an index past the end of the verse', () => {
		expect(suggestedMarks(checks([9], [9]), 5)).toEqual(new Set());
	});

	// markMismatchedWords stops matching where the attempt ran out, so a
	// half-typed verse reports its whole tail as missed. Twice, and an uncapped
	// rule would dot the rest of the verse instead of naming a spot.
	it('caps a give-up at the words where the attempt stalled', () => {
		const tail = [3, 4, 5, 6, 7, 8, 9];
		const out = suggestedMarks(checks(tail, tail), 11);
		expect(out.size).toBe(SUGGEST_MAX_PER_VERSE);
		expect(out).toEqual(new Set([3, 4, 5]));
	});

	// Miss count decides first; ties go to the word you reach first.
	it('ranks by miss count before position', () => {
		expect(suggestedMarks(checks([1, 2, 3, 8], [1, 2, 3, 8], [8]), 11)).toEqual(
			new Set([8, 1, 2])
		);
	});

	it('proposes nothing for a verse with no words', () => {
		expect(suggestedMarks(checks([0], [0]), 0)).toEqual(new Set());
	});

	// The question Phase 1 left open. A hinted clean check writes missed: []
	// and used to occupy a slot in the window; five of them would push both
	// earned misses out and silently retract a suggestion the reader had
	// already earned. Assisted records are dropped before the slice now, for
	// the same reason the quiz's priority rule drops them.
	it('does not let assisted checks evict an earned suggestion', () => {
		const assisted = [1, 2, 3, 4, 5].map(() => ({ missed: [] as number[], hints: 2 }));
		const earned = [{ missed: [2] }, { missed: [2] }];
		expect(suggestedMarks([...assisted, ...earned], 11)).toEqual(new Set([2]));
	});

	it('still counts a check where 힌트 was never pressed', () => {
		expect(suggestedMarks([{ missed: [2], hints: 0 }, { missed: [2] }], 11)).toEqual(
			new Set([2])
		);
	});
});
