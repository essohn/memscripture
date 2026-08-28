import { describe, expect, it } from 'vitest';
import { findSpotFlaws } from '../../src/lib/quiz/spot';

// 그들에게(0) 율례와(1) 법도를(2) 가르쳐서(3) …
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

describe('findSpotFlaws', () => {
	it('finds nothing in the verse itself', () => {
		expect(findSpotFlaws(VERSE, VERSE)).toEqual({ wrong: [], missing: [], flawed: false });
	});

	// A swapped word is a drop and an insert at once, so it shows up in both
	// lists. That is the honest reading and it costs nothing: the word is on
	// screen either way, so the round still has something to tap.
	it('names the word that does not belong', () => {
		expect(findSpotFlaws(VERSE.replace('법도를', '법을'), VERSE)).toEqual({
			wrong: [2],
			missing: [2],
			flawed: true
		});
	});

	// The defect this module exists for. A dropped word leaves nothing to tap,
	// and asking only "which shown word does not belong" called such a sentence
	// intact — so 이상 없음 was graded correct on a sentence that was wrong.
	it('names the word the sentence dropped', () => {
		expect(findSpotFlaws(VERSE.replace('법도를 ', ''), VERSE)).toEqual({
			wrong: [],
			missing: [2],
			flawed: true
		});
	});

	// Indices point into different texts, and saying so here is cheaper than
	// finding out in the markup: `wrong` walks the sentence on screen,
	// `missing` walks the verse it was held against.
	it('indexes wrong against the sentence and missing against the verse', () => {
		const shown = '그들에게 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';
		const flaws = findSpotFlaws(shown, VERSE);
		expect(flaws.missing).toEqual([1]);
		expect(flaws.wrong).toEqual([]);
	});

	it('marks a word that was added', () => {
		const flaws = findSpotFlaws(VERSE.replace('율례와', '율례와 아주'), VERSE);
		expect(flaws.wrong).toEqual([2]);
		expect(flaws.flawed).toBe(true);
	});

	// Korean spacing is a spelling problem, not a difference worth asking about
	// — and the same normalization decides it everywhere else in the app.
	it('is not tripped by spacing', () => {
		expect(findSpotFlaws(VERSE.replace('갈 길과', '갈길과'), VERSE).flawed).toBe(false);
	});

	it('treats an empty sentence as missing everything', () => {
		expect(findSpotFlaws('', VERSE).flawed).toBe(true);
	});
});
