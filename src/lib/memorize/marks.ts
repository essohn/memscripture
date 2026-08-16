import { normalizeForGrading } from './grade';

/**
 * Reader-placed underlines on a verse, per word.
 *
 * Word-level rather than free character ranges because everything else in this
 * app already is — the curtain, the mismatch marking, the hint — so one index
 * means the same thing everywhere, the touch target is a whole word, and a
 * mark stores as a number instead of a pair of offsets.
 */
export interface StoredMark {
	/** Position among the verse's words. */
	i: number;
	/** The word as it read when marked. OYO verses are editable, so an index
	 *  alone would silently slide the underline onto a different word after an
	 *  edit; keeping the text lets a stale mark be dropped instead. */
	w: string;
}

export interface VerseToken {
	text: string;
	/** Index among the words, or null for a run of whitespace. */
	wordIndex: number | null;
}

/**
 * Splits a verse into words and the whitespace between them.
 *
 * The whitespace is kept because read mode renders with `whitespace-pre-line`
 * and the corpus contains line breaks — splitting on `\s+` and rejoining with
 * single spaces would silently reflow the verse. Only words are numbered, so
 * the indices here are the same ones the curtain and the stored marks use.
 */
export function tokenizeVerse(text: string): VerseToken[] {
	const out: VerseToken[] = [];
	let wordIndex = 0;
	for (const part of text.split(/(\s+)/)) {
		if (part === '') continue;
		if (/^\s+$/.test(part)) out.push({ text: part, wordIndex: null });
		else out.push({ text: part, wordIndex: wordIndex++ });
	}
	return out;
}

/**
 * The marks that still point at the word they were placed on.
 *
 * Compared under the grading normalization rather than exactly, so editing an
 * OYO verse's punctuation or spacing keeps the underline while changing the
 * word itself drops it. A mark on the wrong word is worse than no mark: it
 * would tell the reader to watch a spot they never missed.
 */
export function activeMarks(words: string[], saved: StoredMark[]): Set<number> {
	const live = new Set<number>();
	for (const m of saved) {
		const word = words[m.i];
		if (word === undefined) continue;
		if (normalizeForGrading(word) !== normalizeForGrading(m.w)) continue;
		live.add(m.i);
	}
	return live;
}

/** Adds a mark, or removes it if that word is already marked. Kept sorted so
 *  the stored order does not depend on the order they were tapped. */
export function toggleMark(saved: StoredMark[], i: number, w: string): StoredMark[] {
	const without = saved.filter((m) => m.i !== i);
	if (without.length !== saved.length) return without;
	return [...without, { i, w }].sort((a, b) => a.i - b.i);
}
