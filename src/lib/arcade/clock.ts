/**
 * The two sums every timed round needs.
 *
 * Here rather than in each game because they are the same arithmetic, and a
 * second copy of `max(0, limit - elapsed)` is exactly the kind of line that
 * gets fixed in one place and left wrong in the other.
 */

/** Time still on the clock, never below zero. */
export function remainingMs(elapsedMs: number, limitMs: number): number {
	return Math.max(0, limitMs - elapsedMs);
}

/** How much of the clock has gone, 0 to 1. A limit of zero has already run
 *  out — a backgrounded tab hands back one enormous delta, and dividing by
 *  nothing is how that becomes a NaN on screen. */
export function elapsedShare(elapsedMs: number, limitMs: number): number {
	if (limitMs <= 0) return 1;
	return Math.min(1, Math.max(0, elapsedMs / limitMs));
}
