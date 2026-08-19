import { getBookOrdinal } from './index';

/**
 * Linking a verse to the reader at bible.lifescripture.org.
 *
 * That app addresses a chapter as /r/{translation}/{book}/{chapter} with the
 * book as a zero-based index into the canon, and anchors each verse as
 * `#v-{n}`.
 *
 * The canon itself is not repeated here. This module first shipped with its
 * own 66-name table, which meant two tables in one codebase disagreeing about
 * how to spell Nehemiah — the exact way a pair of lookup tables drifts apart.
 * getBookOrdinal is 1-based, so the only arithmetic left is the subtraction.
 */

export interface VerseRef {
	/** Zero-based, as the reader's URL wants it. */
	bookIndex: number;
	chapter: number;
	/** First verse of the citation; a range links to where it starts. */
	verse: number;
}

/**
 * Parses a stored citation — `창세기 28 : 14`, `이사야 54 : 2-3` — into the
 * pieces the reader URL needs.
 *
 * Returns null for anything it cannot place, including an unrecognised book.
 * A hand-written OYO citation should produce no link rather than a link into
 * the wrong book, which reads as a fault that takes far longer to work out.
 */
export function parseVerseRef(cite: string): VerseRef | null {
	const m = cite.trim().match(/^(.+?)\s*(\d+)\s*:\s*(\d+)/);
	if (!m) return null;
	const [, book, chapter, verse] = m;
	const ordinal = getBookOrdinal(book.trim());
	if (ordinal === null) return null;
	return { bookIndex: ordinal - 1, chapter: Number(chapter), verse: Number(verse) };
}

const READER_ORIGIN = 'https://bible.lifescripture.org';

/** Reader URL for a citation, or null when it cannot be placed. */
export function readerHref(cite: string, translation = 'krv'): string | null {
	const ref = parseVerseRef(cite);
	if (!ref) return null;
	return `${READER_ORIGIN}/r/${translation}/${ref.bookIndex}/${ref.chapter}#v-${ref.verse}`;
}
