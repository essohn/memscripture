// Korean Bible book vocabulary and reference parsing.
// Adapted from the qtpassage project's bible.ts so OYO's 장절 autofill
// shares the vocabulary the rest of esohn's scripture tooling assumes.
// The tables follow the Protestant 66-book canon, ordered Genesis → Revelation.

const BOOK_ABBREVIATIONS = [
	'창', '출', '레', '민', '신', '수', '삿', '룻', '삼상', '삼하', '왕상', '왕하',
	'대상', '대하', '스', '느', '에', '욥', '시', '잠', '전', '아', '사', '렘', '애',
	'겔', '단', '호', '욜', '암', '옵', '욘', '미', '나', '합', '습', '학', '슥', '말',
	'마', '막', '눅', '요', '행', '롬', '고전', '고후', '갈', '엡', '빌', '골', '살전',
	'살후', '딤전', '딤후', '딛', '몬', '히', '약', '벧전', '벧후', '요일', '요이', '요삼',
	'유', '계'
];

const BOOK_FULL_NAMES = [
	'창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기',
	'사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야',
	'에스더', '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가',
	'에스겔', '다니엘', '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔',
	'하박국', '스바냐', '학개', '스가랴', '말라기', '마태복음', '마가복음', '누가복음',
	'요한복음', '사도행전', '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서',
	'빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서',
	'디도서', '빌레몬서', '히브리서', '야고보서', '베드로전서', '베드로후서', '요한일서',
	'요한이서', '요한삼서', '유다서', '요한계시록'
];

export interface ParsedRef {
	/** 1-based canonical book number, Genesis = 1, Revelation = 66. */
	bookId: number;
	chapter: number;
	/** null when the user typed only a chapter (e.g. '창12'). */
	startVerse: number | null;
	/** When a single verse was typed, equals startVerse. null when no verse. */
	endVerse: number | null;
}

/**
 * Spellings that are not the canonical one but must still resolve.
 *
 * The table used to carry '느헤미아' because 242_krv spelled it that way while
 * 900_krv used the standard '느헤미야'. The data has since been corrected, so
 * the standard form is canonical and the old one is kept as an alias — an OYO
 * verse typed by hand can still carry it, and a citation that resolves to
 * nothing silently loses its reader link.
 */
const BOOK_ALIASES: Record<string, string> = {
	느헤미아: '느헤미야'
};

/**
 * Returns the canonical book number (1=Genesis ... 66=Revelation) for a
 * Korean book name, accepting either the abbreviation ('왕상') or full
 * name ('열왕기상'). Returns null if the name is not a known book.
 */
export function getBookOrdinal(name: string): number | null {
	const raw = name.trim();
	const t = BOOK_ALIASES[raw] ?? raw;
	for (let i = 0; i < BOOK_FULL_NAMES.length; i++) {
		if (BOOK_ABBREVIATIONS[i] === t || BOOK_FULL_NAMES[i] === t) return i + 1;
	}
	return null;
}

export function getBookFullName(name: string): string | null {
	const idx = getBookOrdinal(name);
	return idx === null ? null : BOOK_FULL_NAMES[idx - 1];
}

/**
 * Parses a free-text Korean passage reference. Accepts either the
 * abbreviated or full book name, optional spaces, optional verse range.
 *
 *   '창12:1-3' → { bookId: 1, chapter: 12, startVerse: 1, endVerse: 3 }
 *   '요 3:16'  → { bookId: 43, chapter: 3, startVerse: 16, endVerse: 16 }
 *   '창12'     → { bookId: 1, chapter: 12, startVerse: null, endVerse: null }
 *
 * Returns null when the leading token is not a recognized book.
 */
export function parsePassageRef(input: string): ParsedRef | null {
	const m = /^(.*?)\s*([0-9]+)(?:\s*:\s*([0-9]+)(?:\s*-\s*([0-9]+))?)?$/.exec(input.trim());
	if (!m) return null;
	const [, bookRaw, chapStr, startStr, endStr] = m;
	const bookId = getBookOrdinal(bookRaw.trim());
	if (bookId === null) return null;
	const chapter = parseInt(chapStr, 10);
	const startVerse = startStr ? parseInt(startStr, 10) : null;
	const endVerse = endStr ? parseInt(endStr, 10) : startVerse;
	return { bookId, chapter, startVerse, endVerse };
}

/**
 * Formats a ParsedRef as the project-standard string with spaces around
 * the colon — matches the existing curated package data:
 *
 *   { bookId: 43, chapter: 3, startVerse: 16, endVerse: 16 }     → '요한복음 3 : 16'
 *   { bookId: 1, chapter: 12, startVerse: 1, endVerse: 3 }       → '창세기 12 : 1-3'
 *   { bookId: 1, chapter: 12, startVerse: null, endVerse: null } → '창세기 12'
 */
/** Psalms, whose chapters are 편 rather than 장. The one book in the Korean
 *  convention that differs, so this is a constant and not a table. */
const PSALMS_ORDINAL = 19;

/**
 * The counter word for a book's chapters — 시편 118'편', everything else
 * 118'장'.
 *
 * Only ever heard, never seen: the stored citation writes the chapter as a
 * bare number ("시편 118 : 13"), so this exists for the synthesizer, which
 * would otherwise say 118장 of a book Korean readers count in 편.
 *
 * Takes the book's name because that is what a citation carries. An unknown
 * name falls back to 장, which is right for 65 of the 66 books and for
 * anything a reader hand-typed.
 */
export function chapterUnit(bookName: string): string {
	return getBookOrdinal(bookName.trim()) === PSALMS_ORDINAL ? '편' : '장';
}

export function formatStandardRef(parsed: ParsedRef): string {
	const name = BOOK_FULL_NAMES[parsed.bookId - 1];
	if (parsed.startVerse === null) return `${name} ${parsed.chapter}`;
	const verseRange =
		parsed.endVerse && parsed.endVerse !== parsed.startVerse
			? `${parsed.startVerse}-${parsed.endVerse}`
			: `${parsed.startVerse}`;
	return `${name} ${parsed.chapter} : ${verseRange}`;
}

/** Ordering key for a verse list. `verse` is 0 when the citation names
 *  only a chapter, which sorts it ahead of that chapter's verses. */
export interface CitationSortKey {
	bookId: number;
	chapter: number;
	verse: number;
}

// Prefix match, not a full-string match: everything after the first verse
// number is deliberately ignored.
const SORT_KEY_RE = /^(.*?)\s*([0-9]+)(?:\s*:\s*([0-9]+))?/;

/**
 * Lenient reader used only to order verse lists by scripture sequence.
 *
 * Deliberately separate from parsePassageRef. That function resolves a
 * reference for fetching verse text, and its {startVerse, endVerse} model
 * cannot honestly represent '요한복음 1 : 1,14' — verses 1 AND 14, not the
 * range 1–14. Widening it would change what OYO's autofill downloads.
 *
 * Ordering needs only the leading verse, so this tolerates every separator
 * the curated data actually uses ('-', '~', '∼', ',') and the 상/하
 * half-verse suffixes, by ignoring whatever follows the first verse number.
 *
 * Returns null when the leading token is not a known book.
 */
export function citationSortKey(cite: string): CitationSortKey | null {
	const m = SORT_KEY_RE.exec(cite.trim());
	if (!m) return null;
	const bookId = getBookOrdinal(m[1].trim());
	if (bookId === null) return null;
	return {
		bookId,
		chapter: parseInt(m[2], 10),
		verse: m[3] ? parseInt(m[3], 10) : 0
	};
}
