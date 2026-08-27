import { describe, expect, it } from 'vitest';
import { hasTypedOpening, openingOf, startDifficultyFor } from '../../src/lib/memorize/timing';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

describe('startDifficultyFor', () => {
	it.each([
		[0, 5],
		[5_000, 5],
		[5_001, 4],
		[10_000, 4],
		[10_001, 3],
		[20_000, 3],
		[20_001, 2],
		[40_000, 2],
		[40_001, 1],
		[600_000, 1]
	])('maps %sms to level %s', (elapsed, level) => {
		expect(startDifficultyFor(elapsed)).toBe(level);
	});
});

describe('startDifficultyFor — a climb rather than a jump', () => {
	// The bands alone said a verse rated xHard becomes xEasy the morning its
	// opening finally comes quickly. It doesn't: that is one good morning.
	it('rises at most one step above the verse own rating', () => {
		expect(startDifficultyFor(4_000)).toBe(5);
		expect(startDifficultyFor(4_000, { previous: 1 })).toBe(2);
		expect(startDifficultyFor(4_000, { previous: 2 })).toBe(3);
	});

	// Nothing to climb from, so the band stands as it is.
	it('leaves an unrated verse to the bands', () => {
		expect(startDifficultyFor(4_000, { previous: null })).toBe(5);
	});

	// Only the climb is limited. A verse that has gone cold says so at once.
	it('does not slow a fall', () => {
		expect(startDifficultyFor(600_000, { previous: 5 })).toBe(1);
	});

	it('never lowers a rating the bands already agree with', () => {
		expect(startDifficultyFor(4_000, { previous: 5 })).toBe(5);
	});
});

describe('startDifficultyFor — a miss in the same session', () => {
	// A check the reader got wrong somewhere is not evidence of an easy verse,
	// however quickly the opening came.
	it('holds the rating to Hard', () => {
		expect(startDifficultyFor(4_000, { missedInSession: true })).toBe(2);
		expect(startDifficultyFor(4_000, { previous: 4, missedInSession: true })).toBe(2);
	});

	it('still lets a slow opening rate lower than Hard', () => {
		expect(startDifficultyFor(600_000, { missedInSession: true })).toBe(1);
	});
});

describe('hasTypedOpening', () => {
	// Two words, not extractFirstClause's 3–8. The clock measures recalling how
	// a verse *starts*; by the second word the reader has clearly got it, and
	// waiting for up to eight turned the reading into typing speed.
	it('is true after the first two words', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와')).toBe(true);
	});

	it('is still true once the reader has typed past them', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와 법도를 가르쳐서')).toBe(true);
	});

	it('is false on the first word alone', () => {
		expect(hasTypedOpening(VERSE, '그들에게')).toBe(false);
	});

	it('is false when the opening is wrong', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율법과')).toBe(false);
	});

	// Same normalization as the score, so spacing never gates the timer.
	it('ignores spacing', () => {
		expect(hasTypedOpening(VERSE, '그들에게율례와')).toBe(true);
	});

	// A two-word verse must still be reachable, and a one-word verse falls back
	// to what it has rather than never stopping the clock.
	it('handles verses shorter than two words', () => {
		expect(hasTypedOpening('할렐루야 아멘', '할렐루야 아멘')).toBe(true);
		expect(hasTypedOpening('할렐루야', '할렐루야')).toBe(true);
	});

	it('is false for an empty attempt', () => {
		expect(hasTypedOpening(VERSE, '')).toBe(false);
		expect(hasTypedOpening('', '')).toBe(false);
	});
});

describe('openingOf', () => {
	it('is the first two words', () => {
		expect(openingOf('그들에게 율례와 법도를 가르쳐서')).toBe('그들에게 율례와');
	});

	// A one-word verse still has an opening, so its clock can stop.
	it('falls back to what a short verse has', () => {
		expect(openingOf('여호와여')).toBe('여호와여');
	});

	it('is empty for an empty verse', () => {
		expect(openingOf('   ')).toBe('');
	});
});
