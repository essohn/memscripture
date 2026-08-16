import { describe, expect, it } from 'vitest';
import { activeMarks, toggleMark, tokenizeVerse } from '../../src/lib/memorize/marks';

const VERSE = '그들에게 율례와 법도를 가르쳐서';

describe('tokenizeVerse', () => {
	it('numbers the words and keeps the gaps between them', () => {
		expect(tokenizeVerse('갈 길과')).toEqual([
			{ text: '갈', wordIndex: 0 },
			{ text: ' ', wordIndex: null },
			{ text: '길과', wordIndex: 1 }
		]);
	});

	// Read mode renders with whitespace-pre-line and the corpus has line breaks.
	// Splitting on \s+ and rejoining with spaces would silently reflow a verse.
	it('preserves a line break rather than flattening it to a space', () => {
		expect(tokenizeVerse('갈\n길과').map((t) => t.text)).toEqual(['갈', '\n', '길과']);
	});

	it('ignores leading and trailing whitespace in the numbering', () => {
		const t = tokenizeVerse('  갈 길과  ');
		expect(t.filter((x) => x.wordIndex !== null).map((x) => x.text)).toEqual(['갈', '길과']);
	});

	// The curtain builds its words with split(/\s+/).filter(Boolean). If the two
	// disagree by even one, every stored mark lands on the wrong word.
	it('numbers words the same way the curtain does', () => {
		for (const text of [VERSE, '  갈 길과  ', '갈\n길과', '가르쳐서, (마땅히)']) {
			const curtain = text.split(/\s+/).filter(Boolean);
			const tokens = tokenizeVerse(text).filter((t) => t.wordIndex !== null);
			expect(tokens.map((t) => t.text)).toEqual(curtain);
			expect(tokens.map((t) => t.wordIndex)).toEqual(curtain.map((_, i) => i));
		}
	});
});

describe('activeMarks', () => {
	const words = VERSE.split(/\s+/);

	it('keeps a mark that still points at its word', () => {
		expect([...activeMarks(words, [{ i: 2, w: '법도를' }])]).toEqual([2]);
	});

	// OYO verses are editable. A mark that survived onto a different word would
	// tell the reader to watch a spot they never missed.
	it('drops a mark whose word has been edited away', () => {
		expect([...activeMarks(words, [{ i: 2, w: '율례를' }])]).toEqual([]);
	});

	it('drops a mark past the end of a shortened verse', () => {
		expect([...activeMarks(words, [{ i: 9, w: '없는말' }])]).toEqual([]);
	});

	// Spacing and punctuation are invisible to the grader, so an edit that only
	// touches them should not cost the reader their underline.
	it('survives a punctuation-only edit', () => {
		expect([...activeMarks(['가르쳐서,'], [{ i: 0, w: '가르쳐서' }])]).toEqual([0]);
	});
});

describe('toggleMark', () => {
	it('adds a mark that is not there', () => {
		expect(toggleMark([], 1, '율례와')).toEqual([{ i: 1, w: '율례와' }]);
	});

	it('removes one that is', () => {
		expect(toggleMark([{ i: 1, w: '율례와' }], 1, '율례와')).toEqual([]);
	});

	it('leaves the other marks alone', () => {
		const before = [
			{ i: 0, w: '그들에게' },
			{ i: 2, w: '법도를' }
		];
		expect(toggleMark(before, 2, '법도를')).toEqual([{ i: 0, w: '그들에게' }]);
	});

	// Stored order should reflect the verse, not the order words were tapped,
	// so two devices that marked the same words agree byte for byte.
	it('keeps the list in verse order however it was tapped', () => {
		let marks = toggleMark([], 3, '가르쳐서');
		marks = toggleMark(marks, 0, '그들에게');
		marks = toggleMark(marks, 2, '법도를');
		expect(marks.map((m) => m.i)).toEqual([0, 2, 3]);
	});
});
