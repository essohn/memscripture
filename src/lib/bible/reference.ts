/**
 * Linking a verse to the reader at bible.lifescripture.org.
 *
 * That app addresses a chapter as /r/{translation}/{book}/{chapter} with the
 * book as a zero-based index into the canon, and anchors each verse as
 * `#v-{n}`. Both facts live here so a change over there is one file to update.
 */

/** The 66 books in canonical order — the index IS the URL segment, so the
 *  order is load-bearing and must match the reader's own table. */
export const BOOKS_KO = [
	'창세기',
	'출애굽기',
	'레위기',
	'민수기',
	'신명기',
	'여호수아',
	'사사기',
	'룻기',
	'사무엘상',
	'사무엘하',
	'열왕기상',
	'열왕기하',
	'역대상',
	'역대하',
	'에스라',
	'느헤미야',
	'에스더',
	'욥기',
	'시편',
	'잠언',
	'전도서',
	'아가',
	'이사야',
	'예레미야',
	'예레미야애가',
	'에스겔',
	'다니엘',
	'호세아',
	'요엘',
	'아모스',
	'오바댜',
	'요나',
	'미가',
	'나훔',
	'하박국',
	'스바냐',
	'학개',
	'스가랴',
	'말라기',
	'마태복음',
	'마가복음',
	'누가복음',
	'요한복음',
	'사도행전',
	'로마서',
	'고린도전서',
	'고린도후서',
	'갈라디아서',
	'에베소서',
	'빌립보서',
	'골로새서',
	'데살로니가전서',
	'데살로니가후서',
	'디모데전서',
	'디모데후서',
	'디도서',
	'빌레몬서',
	'히브리서',
	'야고보서',
	'베드로전서',
	'베드로후서',
	'요한일서',
	'요한이서',
	'요한삼서',
	'유다서',
	'요한계시록'
] as const;

/**
 * Spellings in this corpus that differ from the reader's.
 *
 * `느헤미아` is what the verse data says and what readers see on the card;
 * the reader app spells it `느헤미야`. Aliased rather than corrected in the
 * data, which is not ours to rewrite for the sake of a link.
 */
const ALIASES: Record<string, string> = {
	'느헤미아': '느헤미야'
};

const INDEX_BY_NAME: Map<string, number> = new Map(BOOKS_KO.map((name, i) => [name, i]));

export interface VerseRef {
	bookIndex: number;
	chapter: number;
	/** First verse of the citation; a range links to where it starts. */
	verse: number;
}

/**
 * Parses a stored citation — `창세기 28 : 14`, `이사야 54 : 2-3` — into the
 * pieces the reader URL needs.
 *
 * Returns null for anything it cannot place, including a book name it does not
 * recognise. A hand-written OYO citation should produce no link at all rather
 * than a link into the wrong book, which looks like the app is broken in a
 * more confusing way than a missing button.
 */
export function parseVerseRef(cite: string): VerseRef | null {
	const m = cite.trim().match(/^(.+?)\s*(\d+)\s*:\s*(\d+)/);
	if (!m) return null;
	const [, rawBook, chapter, verse] = m;
	const book = rawBook.trim();
	const index = INDEX_BY_NAME.get(ALIASES[book] ?? book);
	if (index === undefined) return null;
	return { bookIndex: index, chapter: Number(chapter), verse: Number(verse) };
}

const READER_ORIGIN = 'https://bible.lifescripture.org';

/** Reader URL for a citation, or null when it cannot be placed. */
export function readerHref(cite: string, translation = 'krv'): string | null {
	const ref = parseVerseRef(cite);
	if (!ref) return null;
	return `${READER_ORIGIN}/r/${translation}/${ref.bookIndex}/${ref.chapter}#v-${ref.verse}`;
}
