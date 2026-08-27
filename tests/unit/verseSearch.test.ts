import { describe, expect, it } from 'vitest';
import {
	choseong,
	isChoseongQuery,
	normalizeQuery,
	searchVerses,
	type SearchableVerse
} from '../../src/lib/search/verseSearch';

/** The matched substring as it appears on screen. */
function hitText(h: { verse: SearchableVerse; field: string; at: number; length: number }): string {
	const text = h.field === 'cite' ? h.verse.cite : h.field === 'title' ? h.verse.title : h.verse.w;
	return text.slice(h.at, h.at + h.length);
}

const V = (over: Partial<SearchableVerse>): SearchableVerse => ({
	packageId: '900_krv',
	packageName: '900구절',
	no: 1,
	title: 'Vision',
	cite: '창세기 28 : 14',
	w: '네 자손이 땅의 티끌 같이 되어서 동서남북에 편만할지며',
	...over
});

describe('choseong', () => {
	it('reduces syllables to their leading consonant', () => {
		expect(choseong('하나님')).toBe('ㅎㄴㄴ');
	});

	it('handles double consonants', () => {
		expect(choseong('땅의 티끌')).toBe('ㄸㅇ ㅌㄲ');
	});

	it('leaves non-Hangul alone so a mixed query still lines up', () => {
		expect(choseong('요3장')).toBe('ㅇ3ㅈ');
	});
});

describe('isChoseongQuery', () => {
	// Only a query made entirely of bare consonants is an initial-consonant
	// search; ordinary text that happens to contain one is not.
	it('recognises a consonant-only query', () => {
		expect(isChoseongQuery('ㅎㄴㄴ')).toBe(true);
		expect(isChoseongQuery('ㅎ ㄴㄴ')).toBe(true);
	});

	it('rejects ordinary text', () => {
		expect(isChoseongQuery('하나님')).toBe(false);
		expect(isChoseongQuery('')).toBe(false);
	});
});

describe('normalizeQuery', () => {
	// Nobody remembers where the spaces fell in a verse they are looking for,
	// and Korean spacing is unevenly applied even in print.
	it('drops spacing and punctuation', () => {
		expect(normalizeQuery('하나님이 세상을,')).toBe('하나님이세상을');
	});
});

describe('searchVerses', () => {
	const CORPUS = [
		V({ no: 1 }),
		V({ no: 2, title: '양육', cite: '출애굽기 18 : 20', w: '그들에게 율례와 법도를 가르쳐서' }),
		V({ no: 3, title: '사랑', cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' })
	];

	it('finds a phrase in the body', () => {
		const hits = searchVerses(CORPUS, '율례와');
		expect(hits.map((h) => h.verse.no)).toEqual([2]);
		expect(hits[0].field).toBe('body');
	});

	// The verse is stored with spaces the searcher will not reproduce.
	it('ignores spacing in both the query and the verse', () => {
		expect(searchVerses(CORPUS, '하나님이세상을')).toHaveLength(1);
		expect(searchVerses(CORPUS, '하 나 님 이')).toHaveLength(1);
	});

	it('finds by initial consonants', () => {
		const hits = searchVerses(CORPUS, 'ㅎㄴㄴㅇ');
		expect(hits.map((h) => h.verse.no)).toEqual([3]);
	});

	it('finds by title', () => {
		const hits = searchVerses(CORPUS, '양육');
		expect(hits[0].field).toBe('title');
	});

	it('finds by reference', () => {
		const hits = searchVerses(CORPUS, '요한복음 3');
		expect(hits[0].field).toBe('cite');
		expect(hits[0].verse.no).toBe(3);
	});

	// Someone typing a reference wants that verse, not every verse whose text
	// happens to share those syllables.
	it('ranks reference and title matches above body matches', () => {
		const corpus = [
			V({ no: 10, title: 'x', cite: '창세기 1 : 1', w: '사랑이라는 말이 들어간 본문' }),
			V({ no: 11, title: '사랑', cite: '창세기 2 : 2', w: '무관한 본문' })
		];
		expect(searchVerses(corpus, '사랑').map((h) => h.verse.no)).toEqual([11, 10]);
	});

	// Highlighting needs an offset into the text on screen, not into the
	// stripped copy used for matching — off-by-spaces would underline the
	// wrong words.
	it('reports the match position in the original, spaced text', () => {
		const hit = searchVerses([V({ w: '네 자손이 땅의 티끌' })], '땅의')[0];
		expect(hit.at).toBe('네 자손이 '.length);
		expect(hitText(hit)).toBe('땅의');
	});

	// Matching strips spacing, so a query of three characters can cover four on
	// screen. Taking the span from the query length would underline too little.
	it('measures the span in the original text, not in the query', () => {
		const hit = searchVerses([V({ w: '네 자손이 땅의 티끌' })], '자손이땅의')[0];
		expect(hitText(hit)).toBe('자손이 땅의');
	});

	// A title or reference hit must point into that field, not the body —
	// otherwise those rows render plain text with no sign of why they matched.
	it('points at the field that matched', () => {
		const corpus = [V({ no: 5, title: '사랑', cite: '요한복음 3 : 16', w: '무관한 본문' })];
		const byTitle = searchVerses(corpus, '사랑')[0];
		expect(byTitle.field).toBe('title');
		expect(corpus[0].title.slice(byTitle.at, byTitle.at + byTitle.length)).toBe('사랑');

		const byCite = searchVerses(corpus, '요한복음')[0];
		expect(byCite.field).toBe('cite');
		expect(corpus[0].cite.slice(byCite.at, byCite.at + byCite.length)).toBe('요한복음');
	});

	it('returns nothing for an empty or punctuation-only query', () => {
		expect(searchVerses(CORPUS, '')).toEqual([]);
		expect(searchVerses(CORPUS, '  , ')).toEqual([]);
	});

	it('caps the result count', () => {
		const many = Array.from({ length: 50 }, (_, i) => V({ no: i }));
		expect(searchVerses(many, '자손', 10)).toHaveLength(10);
	});
});

// Citations are stored under full book names only, and the search compares the
// query to them as a plain substring. That works for 창 and 대상 by accident —
// they happen to open their own full names — but 31 of the 66 abbreviations do
// not, and nobody types 데살로니가전서.
describe('searchVerses: book abbreviations', () => {
	const 살전 = V({ no: 40, title: '기도', cite: '데살로니가전서 5 : 17-18', w: '쉬지 말고 기도하라' });
	const 창세기 = V({ no: 1, cite: '창세기 28 : 14' });

	it('finds a verse by the abbreviation the reader actually types', () => {
		const hits = searchVerses([살전, 창세기], '살전 5');
		expect(hits).toHaveLength(1);
		expect(hits[0].verse.cite).toBe('데살로니가전서 5 : 17-18');
	});

	it('accepts the abbreviation with no space before the chapter', () => {
		expect(searchVerses([살전, 창세기], '살전5')[0]?.verse.no).toBe(40);
	});

	it('carries the verse through as well as the chapter', () => {
		expect(searchVerses([살전, 창세기], '살전 5:17')[0]?.verse.no).toBe(40);
	});

	// An abbreviation whose full name it does not open, in the other direction:
	// 롬 has no 롬 in 로마서 at all.
	it('finds the books whose abbreviation shares no syllable with their name', () => {
		const 롬 = V({ no: 7, cite: '로마서 8 : 28' });
		const 벧전 = V({ no: 8, cite: '베드로전서 5 : 7' });
		expect(searchVerses([롬, 벧전], '롬 8')[0]?.verse.cite).toBe('로마서 8 : 28');
		expect(searchVerses([롬, 벧전], '벧전 5')[0]?.verse.cite).toBe('베드로전서 5 : 7');
	});

	it('still works when the reader spells the book out', () => {
		expect(searchVerses([살전, 창세기], '데살로니가전서 5')[0]?.verse.no).toBe(40);
		expect(searchVerses([살전, 창세기], '창세기 28')[0]?.verse.no).toBe(1);
	});

	// The expansion must not fire on ordinary text. '사' is 이사야 and '시' is
	// 시편, and rewriting them mid-search would turn a body query into a
	// reference and lose every real hit.
	it('leaves a plain word alone even when it opens with a book abbreviation', () => {
		const 사랑 = V({ no: 9, title: '사랑', cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' });
		expect(searchVerses([사랑], '사랑')[0]?.field).toBe('title');
		expect(searchVerses([사랑], '세상')[0]?.field).toBe('body');
	});

	it('does not expand a book name that is not followed by a chapter', () => {
		const 시편 = V({ no: 10, title: '시작', cite: '시편 23 : 1', w: '여호와는 나의 목자시니' });
		expect(searchVerses([시편], '시작')[0]?.field).toBe('title');
	});

	// The highlight has to land on the citation as printed, not on the
	// abbreviation the reader typed — which is not in the text at all.
	it('highlights the full book name the citation actually shows', () => {
		const hit = searchVerses([살전], '살전 5')[0];
		expect(hitText(hit)).toBe('데살로니가전서 5');
	});
});
