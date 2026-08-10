import type { DifficultyLevel } from '$lib/db/verseRatings';

/**
 * Strips everything that is not a Hangul syllable, Latin letter or digit.
 *
 * In practice this removes spacing and punctuation. Korean spacing is a
 * spelling problem rather than a recall failure, and counting it would make
 * the proposed rating feel unfair — which is worse than useless, because a
 * rating the reader distrusts is one they stop using. Across all 1495
 * shipped verses the only punctuation present is 291 '*' verse-boundary
 * markers, two commas and one pair of parentheses.
 */
export function normalizeForGrading(text: string): string {
	return text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]/g, '');
}

/** Standard edit distance. The longest shipped verse is 224 characters, so
 *  the full matrix costs nothing and there is no reason to optimise it. */
export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	// Single row, rolled forward — the matrix is never needed in full.
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		prev = row;
	}
	return prev[b.length];
}

/**
 * 0..1, dividing by the longer side.
 *
 * Dividing by the expected length alone would let a rambling answer that
 * happens to contain the verse score near 1, and could push the ratio past 1
 * outright.
 */
export function accuracyOf(expected: string, actual: string): number {
	const e = normalizeForGrading(expected);
	const a = normalizeForGrading(actual);
	const longest = Math.max(e.length, a.length);
	if (longest === 0) return 1;
	return Math.max(0, 1 - levenshtein(e, a) / longest);
}

/** Accuracy bands. Expected to need tuning after real use — keep them here. */
const FULL_BANDS: { min: number; level: DifficultyLevel }[] = [
	{ min: 1, level: 5 },
	{ min: 0.95, level: 4 },
	{ min: 0.85, level: 3 },
	{ min: 0.7, level: 2 },
	{ min: 0, level: 1 }
];

export function fullDifficultyFor(accuracy: number): DifficultyLevel {
	return (FULL_BANDS.find((b) => accuracy >= b.min) ?? FULL_BANDS[FULL_BANDS.length - 1]).level;
}

/**
 * Per-word right/wrong marks for display.
 *
 * Marking is per word while the score is per character: a character-level diff
 * highlights fragments of syllables, which is unreadable, and "which words did
 * I miss" is the question the reader actually has.
 */
export function markMismatchedWords(
	expected: string,
	actual: string
): { word: string; ok: boolean }[] {
	const words = expected.trim().split(/\s+/).filter(Boolean);
	const attempt = normalizeForGrading(actual);

	// Walk the verse's words in order, each one searched from just past where
	// the previous one was found. A word counts as produced when it appears
	// at or after that position.
	//
	// This replaced an edit-distance backtrace. That aligned on the same
	// character stream the score uses, which sounded right, but its answer
	// depended on which minimum-cost path it happened to walk — ties are
	// common, and two readings of the same attempt could disagree about a word
	// the reader plainly typed. It was patched once for that and reported
	// again. A forward scan has no ties to break.
	//
	// Advancing the cursor past each hit is what keeps repeated words honest:
	// a verse with 것과 twice needs two separate occurrences, not one matched
	// twice.
	let cursor = 0;
	return words.map((word, i) => {
		const needle = normalizeForGrading(word);
		// A token that normalizes away entirely (a bare '*' marker) has nothing
		// to produce, so it can never be got wrong.
		if (needle.length === 0) return { word, ok: true };

		const at = attempt.indexOf(needle, cursor);
		if (at === -1) return { word, ok: false };

		// A hit further along may be a different occurrence of a repeated word
		// rather than this one. 느헤미야 8:8 has 그 twice: drop the first and an
		// unbounded search finds the second, dragging the cursor past everything
		// between and marking five correct words wrong to explain one missing
		// one. The tell is what sits at the cursor — if the NEXT verse word is
		// already there, this word was skipped, so mark it and stay put.
		if (at > cursor) {
			const following = normalizeForGrading(words[i + 1] ?? '');
			if (following.length > 0 && attempt.startsWith(following, cursor)) {
				return { word, ok: false };
			}
		}

		cursor = at + needle.length;
		return { word, ok: true };
	});
}

