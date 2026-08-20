import { describe, expect, it } from 'vitest';
import { citeShownSeparately, displayTitle } from '../../src/lib/utils/verseTitle';

describe('displayTitle', () => {
	it('uses the title when there is one', () => {
		expect(displayTitle({ title: '부르심', cite: '창세기 12 : 1' })).toBe('부르심');
	});

	// A title has always been optional on a user's own verse. What was never
	// decided is what an untitled one looks like, and an empty heading reads as
	// a broken card rather than a deliberately unnamed one.
	it.each([[''], ['   '], [null], [undefined]])(
		'stands the citation in its place for %o',
		(title) => {
			expect(displayTitle({ title, cite: '창세기 12 : 1' })).toBe('창세기 12 : 1');
		}
	);

	it('is empty when there is neither', () => {
		expect(displayTitle({ title: '', cite: '' })).toBe('');
	});

	it('trims what it returns', () => {
		expect(displayTitle({ title: '  부르심  ', cite: 'x' })).toBe('부르심');
	});
});

describe('citeShownSeparately', () => {
	it('keeps the reference line under a titled verse', () => {
		expect(citeShownSeparately({ title: '부르심' })).toBe(true);
	});

	// Otherwise the card prints the same reference twice — once as its heading
	// and once beneath it.
	it.each([[''], ['   '], [null], [undefined]])('drops the repeat for %o', (title) => {
		expect(citeShownSeparately({ title })).toBe(false);
	});
});
