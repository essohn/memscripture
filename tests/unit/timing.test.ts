import { describe, expect, it } from 'vitest';
import { hasTypedOpening, startDifficultyFor } from '../../src/lib/memorize/timing';

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

describe('hasTypedOpening', () => {
	// extractFirstClause takes the first ~1/3 of the tokens, clamped to 3–8.
	// This verse has 11 words, so the opening is its first 4.
	it('is true once the opening has been typed', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와 법도를 가르쳐서')).toBe(true);
	});

	it('is still true once the reader has typed past the opening', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와 법도를 가르쳐서 마땅히 갈')).toBe(true);
	});

	it('is false while the opening is incomplete', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율례와')).toBe(false);
	});

	it('is false when the opening is wrong', () => {
		expect(hasTypedOpening(VERSE, '그들에게 율법과 법도를 가르쳐서')).toBe(false);
	});

	// Same normalization as the score, so spacing never gates the timer.
	it('ignores spacing', () => {
		expect(hasTypedOpening(VERSE, '그들에게율례와 법도를가르쳐서')).toBe(true);
	});

	it('is false for an empty attempt', () => {
		expect(hasTypedOpening(VERSE, '')).toBe(false);
		expect(hasTypedOpening('', '')).toBe(false);
	});
});
