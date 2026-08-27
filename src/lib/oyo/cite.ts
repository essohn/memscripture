import { formatStandardRef, parsePassageRef } from '$lib/bible/index';
import { cleanText } from '$lib/utils/cleanText';

/**
 * The most verses one import may carry, whichever door it came through.
 *
 * Well past any real selection — a chapter of Psalm 119 is 176 verses —
 * while still bounding the work a single tap can queue up. For a link it
 * also guards a hand-built or truncated URL; for a pasted table it bounds
 * how many chapters the body fill may go and fetch.
 */
export const MAX_IMPORT_VERSES = 200;

/**
 * Rewrites an incoming citation into this project's standard shape, so an
 * imported verse is indistinguishable from one added by hand — "창 12:1" and
 * "창세기 12 : 1" both become the latter.
 *
 * A citation this app cannot parse is kept verbatim rather than rejected.
 * The sender may know about a book naming this one does not, and a verse
 * whose reference reads oddly is worth far more than no verse at all.
 */
export function normalizeCite(cite: string): string {
	const trimmed = cleanText(cite);
	const parsed = parsePassageRef(trimmed);
	return parsed ? formatStandardRef(parsed) : trimmed;
}

/**
 * Which incoming rows the reader already has.
 *
 * Matched on the citation alone, not the body: the point is to stop a second
 * import of the same set from producing twins, and two rows with the same
 * reference are the same verse whatever whitespace differs. Both sides go
 * through normalizeCite so a hand-typed "창 12:1" matches an imported
 * "창세기 12 : 1".
 *
 * Returns indexes rather than filtering, because the screen still shows a
 * duplicate — unchecked, and labelled — instead of silently dropping a row
 * the reader chose to send.
 *
 * Typed on the shape it actually reads rather than on any one door's verse
 * type, so a link payload and a table draft can both be handed to it without
 * this module having to know about either.
 */
export function duplicateIndexes(
	verses: readonly { cite: string }[],
	existingCites: string[]
): Set<number> {
	const have = new Set(existingCites.map(normalizeCite).filter((c) => c.length > 0));
	const out = new Set<number>();
	verses.forEach((v, i) => {
		if (have.has(v.cite)) out.add(i);
	});
	return out;
}
