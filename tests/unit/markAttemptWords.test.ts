import { describe, expect, it } from 'vitest';
import { markAttemptWords } from '../../src/lib/memorize/grade';

const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

/** The rendered shape: typed words plain, the wrong ones in <>. */
function shape(typed: string): string {
	return markAttemptWords(VERSE, typed)
		.map((t) => (t.ok ? t.word : `<${t.word}>`))
		.join(' ');
}

describe('markAttemptWords', () => {
	it('leaves a flawless attempt untouched', () => {
		expect(shape(VERSE)).toBe(VERSE);
	});

	it('marks the word written in the verse word place', () => {
		expect(shape(VERSE.replace('가르쳐서', '가르치고'))).toBe(
			'그들에게 율례와 법도를 <가르치고> 마땅히 갈 길과 할 일을 그들에게 보이고'
		);
	});

	// The block is the reader's own hand. Putting the verse's word in beside
	// theirs made it read as something they had written.
	it('never puts the verse word beside the one written in its place', () => {
		expect(shape(VERSE.replace('가르쳐서', '가르치고'))).not.toContain('가르쳐서');
	});

	it('leaves no trace where a word was skipped', () => {
		const typed = VERSE.replace('마땅히 ', '');
		expect(shape(typed)).toBe(typed);
	});

	it('shows an attempt that stopped early as exactly what was written', () => {
		expect(shape('그들에게 율례와 법도를 가르쳐서')).toBe('그들에게 율례와 법도를 가르쳐서');
	});

	it('shows an attempt that skipped the opening without restoring it', () => {
		const typed = '법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';
		expect(shape(typed)).toBe(typed);
	});

	// The verse word is in there, but the reader wrote more than it. Overlap
	// alone would call this produced and leave the padding unmarked.
	it('marks a word the reader padded with an extra syllable', () => {
		expect(shape(VERSE.replace('마땅히', '마땅히요'))).toContain('<마땅히요>');
	});

	it('marks a word the verse does not have at all', () => {
		expect(shape(VERSE.replace('마땅히', '아주 마땅히'))).toContain('<아주> 마땅히');
	});

	it('has nothing to show when nothing was written', () => {
		expect(markAttemptWords(VERSE, '')).toEqual([]);
	});
});
