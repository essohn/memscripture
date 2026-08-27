import type { DifficultyLevel } from '$lib/db/verseRatings';
import { FLAWED_CEILING, normalizeForGrading } from './grade';

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

export interface StartContext {
	/** The verse's current 첫 시작 rating, or null when it has never been rated. */
	previous?: DifficultyLevel | null;
	/** An attempt in this same check session went wrong. */
	missedInSession?: boolean;
}

/**
 * The 첫 시작 rating for one check.
 *
 * The bands are where it starts, not where it ends. On their own they said a
 * verse rated xHard becomes xEasy the morning its opening finally comes
 * quickly — which is one good morning, not mastery — so the rating climbs by
 * one step at a time and reaches the top across several checks. A verse with
 * no rating yet has nothing to climb from and takes its band as it stands.
 *
 * Only the climb is limited. A verse that has gone cold is allowed to say so
 * in a single check: the point of the rating is to surface what needs work.
 *
 * A miss anywhere in the session overrides both. Recalling the opening fast
 * and then losing the verse is not evidence of an easy verse.
 */
export function startDifficultyFor(elapsedMs: number, context: StartContext = {}): DifficultyLevel {
	const banded = (
		START_BANDS.find((b) => elapsedMs <= b.maxMs) ?? START_BANDS[START_BANDS.length - 1]
	).level;
	const previous = context.previous ?? null;
	// number[], not DifficultyLevel[]: previous + 1 reaches 6 off a 5, which is
	// past the end of the scale but harmless — `banded` is always within it, so
	// the minimum is too.
	const ceilings: number[] = [banded];
	if (previous !== null) ceilings.push(previous + 1);
	if (context.missedInSession) ceilings.push(FLAWED_CEILING);
	return Math.min(...ceilings) as DifficultyLevel;
}

/** Words that count as having started the verse. */
const OPENING_WORDS = 2;

/**
 * The words that count as having started this verse.
 *
 * Exported because 첫 단어 has to *show* the opening when the reader gives up,
 * and slicing it again at the call site would put OPENING_WORDS in two places
 * — two definitions of the same thing, drifting apart the first time either
 * moves.
 */
export function openingOf(verse: string): string {
	return verse.trim().split(/\s+/).filter(Boolean).slice(0, OPENING_WORDS).join(' ');
}

/**
 * Has the reader produced the verse's opening yet?
 *
 * Two words, deliberately — this no longer borrows extractFirstClause, which
 * yields 3–8 words for the daily review card's cue. That is the right size for
 * a *hint*, but the wrong size for this clock: by the second word the reader
 * has plainly recalled how the verse starts, and waiting for up to eight turned
 * 첫 시작 난이도 into a measure of typing speed on long verses.
 *
 * Short verses fall back to whatever they have, so a one- or two-word verse can
 * still stop the clock rather than leaving it running forever.
 *
 * Compared under the grading normalization, so spacing never holds it open.
 */
export function hasTypedOpening(verse: string, typed: string): boolean {
	const opening = normalizeForGrading(openingOf(verse));
	if (opening.length === 0) return false;
	return normalizeForGrading(typed).startsWith(opening);
}
