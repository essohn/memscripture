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
 * Positional, not a diff: word i of the attempt is compared with word i of
 * the verse. A real alignment would forgive an inserted word and shift the
 * rest, but it would also disagree with the character-level score in ways
 * that are hard to explain. This is feedback, not scoring.
 */
export function markMismatchedWords(
	expected: string,
	actual: string
): { word: string; ok: boolean }[] {
	const words = expected.trim().split(/\s+/).filter(Boolean);
	const matched = matchedCharacters(normalizeForGrading(expected), normalizeForGrading(actual));

	// Normalization only ever removes characters, so concatenating the words'
	// normalized forms reproduces the normalized whole — which is what lets a
	// running cursor carve the alignment back into words.
	let cursor = 0;
	return words.map((word) => {
		const length = normalizeForGrading(word).length;
		const span = matched.slice(cursor, cursor + length);
		cursor += length;
		// A token that normalizes away entirely (a bare '*' marker) has nothing
		// to produce, so it can never be got wrong.
		return { word, ok: length === 0 || span.every(Boolean) };
	});
}

/**
 * Per-character alignment: `result[i]` is true when `a[i]` lines up with an
 * identical character in `b`.
 *
 * This replaced comparing word i of the attempt with word i of the verse. That
 * broke on spacing: writing `권하는것과` as one word shifted every later word by
 * a position, so a recitation the score called perfect had its whole tail
 * marked wrong. Score and marking disagreeing about the same input is worse
 * than either being strict or lenient on its own.
 *
 * Aligning on the normalized character stream — the exact string the score is
 * computed from — makes the two agree by construction.
 */
function matchedCharacters(a: string, b: string): boolean[] {
	const rows = a.length;
	const cols = b.length;
	// Full matrix, unlike levenshtein()'s rolled row: the backtrace needs it.
	// The longest shipped verse is 224 characters, so this stays small.
	const d: number[][] = Array.from({ length: rows + 1 }, (_, i) =>
		Array.from({ length: cols + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);
	for (let i = 1; i <= rows; i++) {
		for (let j = 1; j <= cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i][j - 1] + 1, d[i - 1][j] + 1, d[i - 1][j - 1] + cost);
		}
	}

	const matched = new Array<boolean>(rows).fill(false);
	let i = rows;
	let j = cols;
	while (i > 0 && j > 0) {
		// Order matters, and deletion has to come first.
		//
		// Ties are common — several paths often share the minimum cost — and the
		// walk runs backwards, so a match tried first anchors the attempt's last
		// character to the LAST identical character in the verse. Typing only
		// `내가 이를 때까지 읽는` paired that trailing 는 with the 는 of 가르치는
		// twenty characters later, splitting 읽는 and marking it wrong even
		// though it had been typed perfectly.
		//
		// Preferring deletion consumes the verse's unmatched tail first, so
		// matches land as early as they legitimately can. Substitution stays
		// last: it burns a character from each side, and doing that early
		// strands characters a real match needed.
		if (d[i][j] === d[i - 1][j] + 1) {
			i--; // in the verse, absent from the attempt
		} else if (a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
			matched[i - 1] = true;
			i--;
			j--;
		} else if (d[i][j] === d[i][j - 1] + 1) {
			j--; // typed but not in the verse
		} else {
			i--; // substituted
			j--;
		}
	}
	return matched;
}
