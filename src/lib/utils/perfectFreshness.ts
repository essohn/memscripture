/**
 * How lit the 만점 폭죽 on a card should be, given when it was earned.
 *
 * Derived from the check's timestamp rather than stored as a decaying number.
 * A stored value would not fall on its own — it would need recomputing on read
 * anyway, or a background pass — and it would break sync: rows merge
 * last-write-wins, which only holds for values that move in one direction.
 * Two devices holding 0.6 and 0.4 for the same check have no newer one. The
 * timestamp is monotonic, already recorded, and the opacity is a pure function
 * of it.
 */

import { relativeTimeKo } from './relativeTime';

const HOUR_MS = 60 * 60 * 1000;

/** One step down every 8 hours. Three steps to a day, six to extinction. */
export const PERFECT_STEP_MS = 8 * HOUR_MS;

/**
 * Discrete rather than a curve: at 15px the eye cannot read a continuous ramp,
 * and steps put the boundaries somewhere a test can stand.
 */
const STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.25];

/**
 * Opacity for a 만점 badge earned at `checkedAt`, or null once it has faded out.
 *
 * Null, not 0: an icon at zero opacity still occupies its place in the line and
 * is still read aloud by a screen reader. Gone has to mean not rendered.
 *
 * `now` is a parameter so callers can test it against a fixed clock, the way
 * relativeTimeKo takes one.
 */
export function perfectOpacity(checkedAt: number, now: number = Date.now()): number | null {
	// Clamped, not signed — the same drift relativeTimeKo guards against.
	// checkHistory rows sync between devices with independent clocks, so a row
	// can arrive stamped in the future; a negative step index would read off
	// the front of the table and return undefined.
	const delta = Math.max(0, now - checkedAt);
	const step = Math.floor(delta / PERFECT_STEP_MS);
	return STEPS[step] ?? null;
}

/**
 * How long ago the badge was earned, for its accessible name.
 *
 * Hours all the way rather than relativeTimeKo, which turns over to days at
 * 24. The badge's whole life is 48 hours, so that turnover would report 1일 전
 * for everything from the halfway point to the end — one word covering the
 * last three of six steps, in the one channel a reader who cannot see the
 * fading has. Under an hour it defers to relativeTimeKo, so 방금 전 and N분 전
 * read the same here as everywhere else on the card.
 */
export function perfectLabelKo(checkedAt: number, now: number = Date.now()): string {
	const delta = Math.max(0, now - checkedAt);
	if (delta < HOUR_MS) return relativeTimeKo(checkedAt, now);
	return `${Math.floor(delta / HOUR_MS)}시간 전`;
}
