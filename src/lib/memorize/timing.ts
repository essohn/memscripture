import type { DifficultyLevel } from '$lib/db/verseRatings';
import { extractFirstClause } from '$lib/srs/firstClause';
import { normalizeForGrading } from './grade';

/**
 * Elapsed-time bands for 첫 시작 난이도.
 *
 * Absolute seconds rather than a rate: this rating is about recalling how a
 * verse *begins*, which barely varies with the verse's total length.
 * Expected to need tuning after real use — mobile typing is slow.
 */
const START_BANDS: { maxMs: number; level: DifficultyLevel }[] = [
	{ maxMs: 5_000, level: 5 },
	{ maxMs: 10_000, level: 4 },
	{ maxMs: 20_000, level: 3 },
	{ maxMs: 40_000, level: 2 },
	{ maxMs: Infinity, level: 1 }
];

export function startDifficultyFor(elapsedMs: number): DifficultyLevel {
	return (START_BANDS.find((b) => elapsedMs <= b.maxMs) ?? START_BANDS[START_BANDS.length - 1])
		.level;
}

/**
 * Has the reader produced the verse's opening yet?
 *
 * Reuses extractFirstClause, which the daily review card already uses as its
 * Stage 2 cue — the same notion of "opening", so the two features cannot
 * drift apart. Compared under the grading normalization so spacing never
 * holds the timer open.
 */
export function hasTypedOpening(verse: string, typed: string): boolean {
	const opening = normalizeForGrading(extractFirstClause(verse));
	if (opening.length === 0) return false;
	return normalizeForGrading(typed).startsWith(opening);
}
