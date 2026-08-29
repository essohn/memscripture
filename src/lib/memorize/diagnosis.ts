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
