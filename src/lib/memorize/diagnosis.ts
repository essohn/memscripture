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
