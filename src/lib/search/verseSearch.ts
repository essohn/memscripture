/**
 * Finding a verse you half-remember.
 *
 * Three ways in, because that is how people actually look: a phrase from the
 * body, the reference, or the topical title. All of it is a linear scan — the
 * whole shipped corpus is 1495 verses, so an index would be machinery in
 * exchange for nothing.
 */

/** Leading consonant of each Hangul syllable block, in Unicode order. */
const CHOSEONG = [
	'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
	'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'
];
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/**
 * The initial-consonant skeleton of a string: 하나님 → ㅎㄴㄴ.
 *
 * Korean readers search this way as a matter of course, and a search box that
 * ignores it feels broken rather than strict. Non-Hangul characters are kept
 * as they are so a mixed query still lines up.
 */
export function choseong(text: string): string {
	let out = '';
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
			out += CHOSEONG[Math.floor((code - HANGUL_BASE) / 588)];
		} else {
			out += ch;
		}
	}
	return out;
}

/** True when every character is a bare consonant — i.e. the query is a
 *  초성 search rather than ordinary text that happens to contain one. */
export function isChoseongQuery(q: string): boolean {
	const stripped = q.replace(/\s+/g, '');
	return stripped.length > 0 && /^[ㄱ-ㅎ]+$/.test(stripped);
}

/**
 * Spacing is dropped before matching.
 *
 * Korean spacing rules are unevenly applied even in print, and nobody recalls
 * where the spaces fell in a verse they are trying to find. Punctuation goes
 * too, including the corpus's 291 `*` markers.
 */
export function normalizeQuery(text: string): string {
	return text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]/g, '');
}

export interface SearchableVerse {
	packageId: string;
	packageName: string;
	no: number;
	title: string;
	cite: string;
	w: string;
}

export type MatchField = 'body' | 'cite' | 'title';

export interface SearchHit {
	verse: SearchableVerse;
	field: MatchField;
	/**
	 * Offset of the match within the original text of `field` — not always the
	 * body.
	 *
	 * It has to follow the field that matched: reporting it only for body hits
	 * left title and reference rows rendering plain, unhighlighted text with no
	 * indication of why they were results at all.
	 */
	at: number;
	/** Characters the match spans in that original text, which differs from the
	 *  query length wherever the text carries spacing or punctuation. */
	length: number;
}

/**
 * Maps a position in the normalized string back to the original.
 *
 * Matching happens on text with spaces and punctuation removed, so an offset
 * from that string points at the wrong place in the text actually on screen.
 * Highlighting the wrong words is worse than not highlighting.
 */
function originalOffset(original: string, normalizedIndex: number): number | null {
	let seen = 0;
	for (let i = 0; i < original.length; i++) {
		if (normalizeQuery(original[i]).length === 0) continue;
		if (seen === normalizedIndex) return i;
		seen++;
	}
	return null;
}

/**
 * Where `needle` occurs in `haystack`, compared either directly or by initial
 * consonants, and reported as a span of the original text.
 *
 * The span is measured rather than taken from the query's length: matching
 * happens with spaces and punctuation stripped, so a three-character query can
 * cover four characters on screen.
 */
function findIn(
	haystack: string,
	needle: string,
	byChoseong: boolean
): { at: number; length: number } | null {
	const normalized = normalizeQuery(haystack);
	const subject = byChoseong ? choseong(normalized) : normalized;
	const at = subject.indexOf(needle);
	if (at === -1) return null;
	const start = originalOffset(haystack, at);
	if (start === null) return null;
	// The position just past the LAST matched character, not the position of the
	// next one — those differ by whatever spacing sits between them, and using
	// the latter drags a trailing space into the highlight.
	const lastChar = originalOffset(haystack, at + needle.length - 1);
	const end = lastChar === null ? haystack.length : lastChar + 1;
	return { at: start, length: end - start };
}

/**
 * A reference like `요3:16`, `요한복음 3장 16절`, or `창 28 14`.
 *
 * Returned as the digits alone so it can be compared against a citation under
 * the same normalization as everything else — the corpus writes references six
 * different ways and none of them is what a person types.
 */
export function looksLikeReference(q: string): boolean {
	return /[가-힣]{1,6}\s*\d/.test(q) || /^\d+\s*[:장]/.test(q);
}

/**
 * Verses matching the query, best field first.
 *
 * Body matches come last deliberately: someone typing a reference or a title
 * wants that verse, not the forty verses whose text happens to contain the
 * same syllables.
 */
export function searchVerses(
	verses: SearchableVerse[],
	query: string,
	limit = 100
): SearchHit[] {
	const q = normalizeQuery(query);
	if (q.length === 0) return [];
	const byChoseong = isChoseongQuery(query);
	const needle = q;

	const cite: SearchHit[] = [];
	const title: SearchHit[] = [];
	const body: SearchHit[] = [];

	for (const v of verses) {
		const inCite = findIn(v.cite, needle, byChoseong);
		if (inCite) {
			cite.push({ verse: v, field: 'cite', ...inCite });
			continue;
		}
		const inTitle = findIn(v.title, needle, byChoseong);
		if (inTitle) {
			title.push({ verse: v, field: 'title', ...inTitle });
			continue;
		}
		const inBody = findIn(v.w, needle, byChoseong);
		if (inBody) body.push({ verse: v, field: 'body', ...inBody });
	}

	return [...cite, ...title, ...body].slice(0, limit);
}
