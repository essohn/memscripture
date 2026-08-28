import type { DifficultyLevel } from '$lib/db/verseRatings';

/**
 * Ordering verses by how hard they are, hardest first.
 *
 * The scale runs 0 Impossible → 5 xEasy, so "hardest first" is ascending. That
 * is backwards from how a number usually sorts, which is exactly why it lives in
 * a named function instead of a comparator written inline at each call site.
 */

export interface VerseRating {
	start: DifficultyLevel | null;
	full: DifficultyLevel | null;
}

/**
 * One level against another: harder first, unrated last.
 *
 * Unrated sorts to the bottom rather than the top no matter which key asks.
 * An unrated verse carries no signal at all, and on a package where most have
 * never been rated it would otherwise bury the handful the reader actually
 * marked as hard — which is the entire thing this ordering is for.
 */
function byLevel(a: DifficultyLevel | null, b: DifficultyLevel | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a - b;
}

/**
 * 시작 난이도 first, then 전체 난이도, hardest first in both, stable within a tie.
 *
 * Two keys in sequence, not one number made out of both. The two ratings answer
 * different questions — how hard to get going, how hard to finish — and any
 * function that folds them into a single level (the hardest of the two, their
 * average, their sum) throws away the distinction the reader just spent two
 * taps recording. Collapsing to the harder of the two is the worst of them for
 * a list that shows both: it ties 시작 5 / 전체 1 with 시작 1 / 전체 5, so the
 * 시작 column reads 5, 1, 3, 1 and the order looks like no order at all.
 *
 * 시작 leads because that is the rating that decides whether a verse gets
 * started, and the reader working down a hardest-first list is choosing what to
 * open next. 전체 then separates verses that begin alike.
 *
 * Stable, so verses rated alike keep whatever order they arrived in: this sorts
 * a list that is already in scripture or booklet order, and scrambling ties
 * would make the result look arbitrary.
 */
export function sortByDifficulty<T>(
	verses: readonly T[],
	ratingOf: (verse: T) => VerseRating | undefined | null
): T[] {
	return verses
		.map((verse, index) => ({ verse, index, rating: ratingOf(verse) }))
		.sort(
			(a, b) =>
				byLevel(a.rating?.start ?? null, b.rating?.start ?? null) ||
				byLevel(a.rating?.full ?? null, b.rating?.full ?? null) ||
				a.index - b.index
		)
		.map((entry) => entry.verse);
}
