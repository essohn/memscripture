import type { CheckRecord } from '$lib/db/local';

/**
 * Records needed before the diagnosis says anything at all.
 *
 * One point is not a trend and one attempt is not a pattern. A summary drawn
 * over a single check would be the app asserting something it cannot know —
 * the same judgement hasEventStats makes when it declines to draw an empty
 * chart rather than drawing an honest-looking empty one.
 */
export const MIN_RECORDS = 2;

/**
 * What this verse has cost so far, across the records the sheet is showing.
 *
 * `hints` floors an absent count at 0. That is a real loss of meaning —
 * absent means the check predates the field, not that no hint was pressed —
 * but a sum has no way to carry "unknown" the way a rate does, so the choice
 * is between a floor and no line at all.
 */
export function effortTotals(records: CheckRecord[]): {
	checks: number;
	hints: number;
	ms: number;
} {
	let hints = 0;
	let ms = 0;
	for (const r of records) {
		hints += r.hints ?? 0;
		ms += r.elapsedMs;
	}
	return { checks: records.length, hints, ms };
}

/**
 * Accuracy per check, oldest first.
 *
 * Reversed here rather than at the call site because a chart reads left to
 * right and listChecks hands its rows back newest-first. Doing it once, in
 * the module that owns the convention, is one place to be wrong instead of
 * one per consumer.
 */
export function accuracySeries(records: CheckRecord[]): number[] {
	return records.map((r) => r.accuracy).reverse();
}

/**
 * Slope below which the reader's ratings are noise rather than a direction.
 *
 * 0.15 per check is roughly one level of movement across a seven-check
 * window. A tuning constant — exported so a test can state the number it is
 * pinning rather than encoding it in a fixture nobody can read.
 */
export const FLAT_SLOPE = 0.15;

export type Trend = 'improving' | 'flat' | 'worsening' | 'unknown';

/**
 * Which way this reader's own sense of the verse has been moving.
 *
 * Least squares over the rated checks, not first-versus-last: with a
 * six-value series a single generous evening at the end would otherwise flip
 * the verdict, and the reader's rating is a mood as much as a measurement.
 *
 * `improving` is a POSITIVE slope. DIFFICULTY_LEVELS runs 0=Impossible to
 * 5=xEasy, so the number going up is the verse getting easier. The component
 * says 쉬워지는 중 rather than 개선 for the same reason: naming the direction
 * the reader actually feels removes the inversion from everyone's head.
 */
export function difficultyTrend(records: CheckRecord[], dim: 'start' | 'full'): Trend {
	// Oldest first: a slope over positions is meaningless if the positions run
	// backwards, and it would silently invert every verdict.
	const values: number[] = [];
	for (let i = records.length - 1; i >= 0; i--) {
		const v = records[i][dim];
		// 포기 stores null, and a synced row from an older client could carry
		// anything; only a real level takes a position in the series.
		if (typeof v === 'number') values.push(v);
	}
	if (values.length < 3) return 'unknown';

	const n = values.length;
	const meanX = (n - 1) / 2;
	const meanY = values.reduce((a, b) => a + b, 0) / n;
	let covariance = 0;
	let variance = 0;
	for (let i = 0; i < n; i++) {
		covariance += (i - meanX) * (values[i] - meanY);
		variance += (i - meanX) ** 2;
	}
	// n >= 3 guarantees variance > 0, so there is no divide-by-zero branch to
	// write and none to leave untested.
	const slope = covariance / variance;

	if (Math.abs(slope) < FLAT_SLOPE) return 'flat';
	return slope > 0 ? 'improving' : 'worsening';
}

/**
 * Attempts that must have reached a word before its colour means anything.
 *
 * Carries the same idea as SUGGEST_MIN_MISSES: one incident is an accident,
 * not a diagnosis. Without it a verse checked once after a long gap would
 * light up on a single slip.
 */
export const MIN_REACH = 2;

/**
 * Accuracy at or above which a check with no saved `typed` is assumed to have
 * reached the end of the verse.
 *
 * markMismatchedWords reports the whole unreached tail as wrong, so an
 * attempt abandoned halfway scores around half and an abandoned opening
 * scores near nothing. Above this line the attempt plausibly went the
 * distance and its misses are real misses; below it, nothing can be said.
 *
 * Deliberately NOT quiz/games' isRecallableAttempt, whose 0.9 threshold and
 * exclusion of a perfect score answer a different question — whether a
 * sentence makes a good 틀린 곳 찾기 puzzle. Borrowing it would drop every
 * flawless check from the heat map and weld this metric to a constant that
 * will be tuned for the quiz.
 */
export const ASSUME_COMPLETE_MIN_ACCURACY = 0.5;

export type HeatTier = 'none' | 'rare' | 'sometimes' | 'often';

export interface WordHeat {
	/** Attempts that got this far. */
	reached: number;
	/** Of those, how many got this word wrong. */
	missed: number;
	/** missed / reached, or null when nothing reached this word — which is a
	 *  different thing from a word nobody ever missed. */
	rate: number | null;
	tier: HeatTier;
}

/**
 * How many words into the verse this attempt reached.
 *
 * Approximated from the attempt's own token count, not recovered exactly.
 * markMismatchedWords walks a normalized character stream with a cursor, so
 * "which word did they stop at" is not a thing it reports and not a thing
 * this can ask it for. What is needed here is the denominator of a
 * three-step tint, not an audit trail, and the approximation errs in the
 * honest direction: a reader who typed fewer words than the verse holds did
 * produce less of it.
 *
 * `typed === ''` — saved having typed nothing — falls to the second branch
 * and yields 0, which is right: it reached no word.
 */
function reachOf(r: CheckRecord, wordCount: number): number {
	if (r.typed === undefined) {
		return r.accuracy >= ASSUME_COMPLETE_MIN_ACCURACY ? wordCount : 0;
	}
	return Math.min(wordCount, r.typed.trim().split(/\s+/).filter(Boolean).length);
}

function tierOf(reached: number, rate: number | null): HeatTier {
	if (rate === null || rate <= 0 || reached < MIN_REACH) return 'none';
	if (rate >= 2 / 3) return 'often';
	if (rate >= 1 / 3) return 'sometimes';
	return 'rare';
}

/**
 * How often each word of the verse has actually been got wrong.
 *
 * A rate rather than a count, because markMismatchedWords reports every word
 * past where an attempt stopped as missed — so counting raw misses would
 * paint the tail of the verse red on the strength of one surrender.
 *
 * Derived on every read rather than stored, on the terms suggestedMarks set:
 * a stored map would need a schema version, a merge rule, a decay policy and
 * an answer for an OYO verse edited under it, and worse, after the reader
 * fixes a word it would keep pointing at a place that is already fixed.
 */
export function wordHeat(records: CheckRecord[], wordCount: number): WordHeat[] {
	const reached = new Array<number>(Math.max(0, wordCount)).fill(0);
	const missed = new Array<number>(Math.max(0, wordCount)).fill(0);

	for (const r of records) {
		// Absent is not an empty array: this check predates the field and
		// measured nothing about positions, so counting its reach would score
		// every word as a clean run on evidence that does not exist.
		if (!r.missed) continue;

		const reach = reachOf(r, wordCount);
		for (let i = 0; i < reach; i++) reached[i]++;

		// Bounded by `reach`, which does two jobs at once: it drops the tail of
		// an abandoned attempt, and it drops an index past the end of an OYO
		// verse edited shorter than its own history.
		for (const i of new Set(r.missed)) {
			if (i < 0 || i >= reach) continue;
			missed[i]++;
		}
	}

	return reached.map((n, i) => {
		const rate = n === 0 ? null : missed[i] / n;
		return { reached: n, missed: missed[i], rate, tier: tierOf(n, rate) };
	});
}
