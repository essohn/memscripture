import type { DifficultyLevel } from '$lib/db/verseRatings';

/**
 * Ordering verses by how hard they are, hardest first.
 *
 * The scale runs 1 xHard → 5 xEasy, so "hardest first" is ascending. That is
 * backwards from how a number usually sorts, which is exactly why it lives in
 * a named function instead of a comparator written inline at each call site.
 */

export interface VerseRating {
	start: DifficultyLevel | null;
	full: DifficultyLevel | null;
}

/**
 * A verse's difficulty as one number, or null when it has never been rated.
 *
 * The harder of the two ratings wins. They answer different questions — how
 * hard to get going, how hard to finish — and a verse that is punishing in
 * either is a verse worth seeing near the top. Taking the average would let a
 * comfortable start hide a body nobody can finish.
 */
export function hardestLevel(rating: VerseRating | undefined | null): number | null {
	if (!rating) return null;
	const levels = [rating.start, rating.full].filter((l): l is DifficultyLevel => l !== null);
	return levels.length === 0 ? null : Math.min(...levels);
}

/**
 * Hardest first, unrated last, and stable within a tie.
 *
 * Unrated verses go to the bottom rather than the top. They carry no signal at
 * all, and on a package where most verses have never been rated they would
 * otherwise bury the handful the reader actually marked as hard — which is the
 * entire thing this ordering is for.
 *
 * Stable, so verses of equal difficulty keep whatever order they arrived in:
 * this sorts a list that is already in scripture or booklet order, and
 * scrambling ties would make the result look arbitrary.
 */
export function sortByDifficulty<T>(
	verses: readonly T[],
	ratingOf: (verse: T) => VerseRating | undefined | null
): T[] {
	return verses
		.map((verse, index) => ({ verse, index, level: hardestLevel(ratingOf(verse)) }))
		.sort((a, b) => {
			if (a.level === b.level) return a.index - b.index;
			if (a.level === null) return 1;
			if (b.level === null) return -1;
			return a.level - b.level;
		})
		.map((entry) => entry.verse);
}
