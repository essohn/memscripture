import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseVerseRef, readerHref } from '../../src/lib/bible/reference';
import { getBookOrdinal } from '../../src/lib/bible/index';

describe('the canon comes from one table', () => {
	// The URL segment is the shared table's ordinal minus one. This module used
	// to carry a second copy of the 66 names, which promptly disagreed with the
	// first about how to spell Nehemiah.
	it('matches getBookOrdinal, zero-based', () => {
		expect(parseVerseRef('창세기 1 : 1')?.bookIndex).toBe(getBookOrdinal('창세기')! - 1);
		expect(parseVerseRef('요한계시록 22 : 21')?.bookIndex).toBe(getBookOrdinal('요한계시록')! - 1);
	});
});

describe('parseVerseRef', () => {
	it('places a plain citation', () => {
		expect(parseVerseRef('창세기 28 : 14')).toEqual({ bookIndex: 0, chapter: 28, verse: 14 });
	});

	it('links a range to where it starts', () => {
		expect(parseVerseRef('이사야 54 : 2-3')).toMatchObject({ chapter: 54, verse: 2 });
	});

	it('handles a book whose name carries a numeral', () => {
		expect(parseVerseRef('요한일서 5 : 11-12')?.bookIndex).toBe(getBookOrdinal('요한일서')! - 1);
	});

	// The data now spells it the standard way, but the old form stays resolvable
	// — an OYO verse typed by hand can still carry it, and an unresolved
	// citation loses its link with no explanation.
	it('still accepts the old spelling of Nehemiah', () => {
		expect(parseVerseRef('느헤미아 8 : 8')?.bookIndex).toBe(getBookOrdinal('느헤미야')! - 1);
		expect(parseVerseRef('느헤미야 8 : 8')?.bookIndex).toBe(getBookOrdinal('느헤미야')! - 1);
	});

	// A link into the wrong book is worse than no link: it looks like the app
	// is broken in a way that takes longer to work out.
	it('refuses a book it cannot place', () => {
		expect(parseVerseRef('요한복음서 3 : 16')).toBeNull();
		expect(parseVerseRef('내 메모 3 : 16')).toBeNull();
		expect(parseVerseRef('아무 말')).toBeNull();
	});
});

describe('readerHref', () => {
	it('addresses the chapter and anchors the verse', () => {
		expect(readerHref('창세기 28 : 14')).toBe(
			'https://bible.lifescripture.org/r/krv/0/28#v-14'
		);
	});

	it('is null when the citation cannot be placed', () => {
		expect(readerHref('메모 1 : 1')).toBeNull();
	});
});

describe('every shipped citation resolves', () => {
	const cites: string[] = [];
	for (const f of readdirSync('static/data')) {
		if (!f.endsWith('_krv.json')) continue;
		const raw: unknown = JSON.parse(readFileSync(`static/data/${f}`, 'utf8'));
		const rows = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);
		for (const v of rows.flat()) {
			if (v && typeof v === 'object' && 'cite' in v) cites.push(String((v as { cite: string }).cite));
		}
	}

	it('covers the corpus', () => {
		expect(cites.length).toBeGreaterThan(1400);
	});

	// One unrecognised book name would leave those verses with no link and no
	// explanation. Checking all of them is what caught 느헤미아.
	it('leaves no citation unlinkable', () => {
		const unresolved = [...new Set(cites.filter((c) => readerHref(c) === null))];
		expect(unresolved).toEqual([]);
	});

	it('never points outside the canon', () => {
		for (const c of cites) {
			const ref = parseVerseRef(c)!;
			expect(ref.bookIndex).toBeGreaterThanOrEqual(0);
			expect(ref.bookIndex).toBeLessThan(66);
			expect(ref.chapter).toBeGreaterThan(0);
			expect(ref.verse).toBeGreaterThan(0);
		}
	});
});
