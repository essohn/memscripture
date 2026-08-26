import type { CheckRecord } from '$lib/db/local';

/** How many recent checks are consulted. */
export const SUGGEST_WINDOW = 5;
/** How many misses inside that window earn a suggestion. */
export const SUGGEST_MIN_MISSES = 2;
/**
 * How many spots one verse may propose at once.
 *
 * markMismatchedWords walks the verse forward and stops matching where the
 * attempt ran out, so an attempt the reader gave up on and submitted
 * half-typed reports the entire tail of the verse as missed. Two of those and
 * an uncapped rule would dot twenty words — which is not a hint about a spot,
 * it is the verse highlighted.
 *
 * Deliberately narrower than what the reader can mark by hand: the suggestion
 * is a nudge toward a place, the marking is theirs.
 */
export const SUGGEST_MAX_PER_VERSE = 3;

/**
 * The words this reader keeps missing, as positions in the verse.
 *
 * Derived on every read rather than stored. A stored suggestion would need a
 * schema version, a merge rule, a decay policy and an answer for what happens
 * when an OYO verse is edited under it; computing it from the records that
 * already exist removes all four, and it cannot disagree with the history it
 * came from. The same reasoning listPerfectVerseNos states.
 *
 * `history` is most-recent-first, as listChecks() returns it.
 */
export function suggestedMarks(
	history: Pick<CheckRecord, 'missed'>[],
	wordCount: number
): Set<number> {
	if (wordCount <= 0) return new Set();

	const tally = new Map<number, number>();
	for (const record of history.slice(0, SUGGEST_WINDOW)) {
		// Absent is not an empty array: the check predates this feature and
		// measured nothing, so it fills the window silently rather than counting
		// as a clean run.
		if (!record.missed) continue;
		for (const i of new Set(record.missed)) {
			// An OYO verse can be edited shorter than the history that describes it.
			if (i < 0 || i >= wordCount) continue;
			tally.set(i, (tally.get(i) ?? 0) + 1);
		}
	}

	return new Set(
		[...tally]
			.filter(([, misses]) => misses >= SUGGEST_MIN_MISSES)
			// Most-missed first, ties toward the earlier word — so a verse proposes
			// the places you reach first, which for a give-up is exactly where the
			// attempt stalled.
			.sort((a, b) => b[1] - a[1] || a[0] - b[0])
			.slice(0, SUGGEST_MAX_PER_VERSE)
			.map(([i]) => i)
	);
}
