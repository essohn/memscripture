import { describe, expect, it } from 'vitest';
import { alignAttempt } from '../../src/lib/memorize/grade';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

/** The rendered shape: typed words plain, wrong ones in <>, skipped ones in []. */
function shape(typed: string): string {
	return alignAttempt(VERSE, typed)
		.map((t) => (t.kind === 'missing' ? `[${t.word}]` : t.ok ? t.word : `<${t.word}>`))
		.join(' ');
}

describe('alignAttempt', () => {
	it('leaves a flawless attempt untouched', () => {
		expect(shape(VERSE)).toBe(VERSE);
	});

	// The wrong word and the right one land side by side, which is the whole
	// correction in one glance.
	it('sets the right word beside the one written in its place', () => {
		expect(shape(VERSE.replace('가르쳐서', '가르치고'))).toBe(
			'그들에게 율례와 법도를 <가르치고> [가르쳐서] 마땅히 갈 길과 할 일을 그들에게 보이고'
		);
	});

	// The gap the old marking could not show: nothing was typed there, so
	// there was no word to paint red.
	it('shows a skipped word where it belonged', () => {
		expect(shape(VERSE.replace('마땅히 ', ''))).toBe(
			'그들에게 율례와 법도를 가르쳐서 [마땅히] 갈 길과 할 일을 그들에게 보이고'
		);
	});

	it('keeps two skipped words in verse order, together', () => {
		expect(shape(VERSE.replace('갈 길과 ', ''))).toContain('마땅히 [갈] [길과] 할');
	});

	it('shows the tail the reader never reached', () => {
		expect(shape('그들에게 율례와 법도를 가르쳐서')).toBe(
			'그들에게 율례와 법도를 가르쳐서 [마땅히] [갈] [길과] [할] [일을] [그들에게] [보이고]'
		);
	});

	it('shows an opening the reader skipped before what they did write', () => {
		expect(shape('법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고')).toBe(
			'[그들에게] [율례와] 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고'
		);
	});

	// The verse word is in there, but the reader wrote more than it. Overlap
	// alone would call this produced and leave the padding unmarked.
	it('marks a word the reader padded with an extra syllable', () => {
		expect(shape(VERSE.replace('마땅히', '마땅히요'))).toContain('<마땅히요>');
	});

	it('marks a word the verse does not have at all', () => {
		expect(shape(VERSE.replace('마땅히', '아주 마땅히'))).toContain('<아주> 마땅히');
	});

	// A '*' is a verse-boundary marker, not something anyone recites.
	it('never offers a punctuation-only token as a skipped word', () => {
		const out = alignAttempt('첫째 * 둘째', '첫째');
		expect(out.filter((t) => t.kind === 'missing').map((t) => t.word)).toEqual(['둘째']);
	});

	it('reports the whole verse as skipped when nothing was written', () => {
		expect(alignAttempt(VERSE, '').every((t) => t.kind === 'missing')).toBe(true);
	});
});
