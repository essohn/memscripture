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

/** Ceiling once anything at all was wrong. A near miss is still a miss, so it
 *  cannot reach the top of the scale. */
const FLAWED_CEILING: DifficultyLevel = 3;

/** Typing pace, in normalized characters per second, for a flawed attempt.
 *  Rate rather than elapsed seconds: the corpus runs from short verses to 224
 *  characters, and a long one must not score badly for being long. */
const PACE_BANDS: { minCharsPerSecond: number; level: DifficultyLevel }[] = [
	{ minCharsPerSecond: 1.5, level: 3 },
	{ minCharsPerSecond: 0.8, level: 2 },
	{ minCharsPerSecond: 0, level: 1 }
];

/**
 * 전체 암송 난이도 from accuracy first, then pace.
 *
 * A flawless attempt scores 5 no matter how long it took — accuracy is what
 * this rating is about, and a careful correct recitation is not worse than a
 * hurried one. Anything less is capped at 3 however small the slip, and pace
 * lowers it from there.
 *
 * Note this makes elapsed time feed both ratings: 첫 시작 from the moment the
 * opening was recalled, 전체 from the pace across the whole verse. They
 * measure different things, but a slow day moves both.
 */
export function fullDifficultyFrom(
	accuracy: number,
	verseLength: number,
	elapsedMs: number
): DifficultyLevel {
	if (accuracy >= 1) return 5;
	// No pace to compute without both a verse and a duration; fall back to the
	// ceiling rather than punishing a measurement we do not have.
	if (verseLength <= 0 || elapsedMs <= 0) return FLAWED_CEILING;
	const charsPerSecond = verseLength / (elapsedMs / 1000);
	const paced = (
		PACE_BANDS.find((b) => charsPerSecond >= b.minCharsPerSecond) ??
		PACE_BANDS[PACE_BANDS.length - 1]
	).level;
	return Math.min(FLAWED_CEILING, paced) as DifficultyLevel;
}

/** How far past the expected position a word may still be recognised. Roughly
 *  one short Korean word, which is what a single dropped or inserted word
 *  shifts things by. */
const MAX_DRIFT_CHARS = 6;

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
	return words.map((word) => {
		const needle = normalizeForGrading(word);
		// A token that normalizes away entirely (a bare '*' marker) has nothing
		// to produce, so it can never be got wrong.
		if (needle.length === 0) return { word, ok: true };

		// Search only near where this word is due. A verse repeats words — 느헤미야
		// 8:8 has 그 twice, and 창세기 35:11 has 나고 — so an unbounded search can
		// land on a later occurrence, drag the cursor past everything between,
		// and mark a dozen correct words wrong to account for one that was
		// dropped or mistyped. A correct attempt has no gap at all; the
		// allowance covers a short skipped or inserted word and stops well short
		// of the next occurrence.
		const at = attempt.indexOf(needle, cursor);
		if (at === -1 || at - cursor > MAX_DRIFT_CHARS) return { word, ok: false };
		cursor = at + needle.length;
		return { word, ok: true };
	});
}

export interface Hint {
	/** Position of this word in the verse. The panel resets its press count
	 *  when this moves, so a newly stuck word opens from one character again
	 *  rather than inheriting the credit spent on the previous one. */
	index: number;
	/** The whole word, for measuring how much is still hidden. */
	word: string;
	/** The leading characters revealed so far. */
	revealed: string;
}

/**
 * The next few characters of wherever the reader is stuck.
 *
 * Where they are stuck is not computed here: markMismatchedWords already walks
 * the verse in order and stops producing matches at exactly that point, so the
 * first unmatched word *is* the answer. Reusing it also keeps the hint and the
 * post-submit marking from ever disagreeing about the same attempt.
 *
 * `presses` is cumulative — one character for the first, one more for each
 * after, rolling on to the following word once the current one is fully open.
 * Returns null when the verse has been produced in full and there is nothing
 * left to hint at.
 */
export function nextHint(expected: string, actual: string, presses: number): Hint | null {
	if (presses < 1) return null;

	const marks = markMismatchedWords(expected, actual);
	const start = marks.findIndex((m) => !m.ok);
	if (start === -1) return null;

	let remaining = presses;
	let last: Hint | null = null;
	for (let i = start; i < marks.length; i++) {
		const { word } = marks[i];
		// A bare '*' verse marker has no characters to give away.
		if (normalizeForGrading(word).length === 0) continue;
		if (remaining <= word.length) return { index: i, word, revealed: word.slice(0, remaining) };
		remaining -= word.length;
		last = { index: i, word, revealed: word };
	}
	// More presses than the verse has characters: hold at the end rather than
	// wrapping around to the beginning.
	return last;
}


