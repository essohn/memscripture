/**
 * The letter a session ends on.
 *
 * Read off passes alone, never off points: points reward speed and chains,
 * and a reader who is slow but right has still recited every verse. Making
 * the headline letter depend on the arcade would tell them otherwise.
 */
export const RANKS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Rank = (typeof RANKS)[number];

const BANDS: { atLeast: number; rank: Rank }[] = [
	{ atLeast: 1, rank: 'S' },
	{ atLeast: 0.85, rank: 'A' },
	{ atLeast: 0.7, rank: 'B' },
	{ atLeast: 0.5, rank: 'C' },
	{ atLeast: 0, rank: 'D' }
];

/** Null for a session with no rounds — there is nothing there to grade. */
export function rankOf(passed: number, total: number): Rank | null {
	if (total <= 0) return null;
	const share = passed / total;
	return (BANDS.find((b) => share >= b.atLeast) ?? BANDS[BANDS.length - 1]).rank;
}
