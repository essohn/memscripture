import { markMismatchedWords } from '$lib/memorize/grade';

/** What is wrong with the sentence 틀린 곳 찾기 is showing. */
export interface SpotFlaws {
	/** Indices into the *shown* sentence whose words do not belong. */
	wrong: number[];
	/** Indices into the *verse* whose words the sentence dropped. */
	missing: number[];
	/** The sentence differs from the verse in either direction. */
	flawed: boolean;
}

/**
 * The difference between the sentence on screen and the verse, both ways.
 *
 * Asked in one direction only — which shown word does not belong — a sentence
 * that simply dropped a word comes back clean: every word it does have is a
 * word of the verse. The round then had no right answer at all, and 이상 없음
 * was graded correct on a sentence the reader had got wrong. The design doc
 * wrote that down as a gap in what the game can ask; it was a wrong verdict on
 * a question the game was already asking.
 *
 * The second direction costs one more pass over the same helper and turns the
 * omission into something the round can be answered about — not by tapping,
 * since there is nothing there to tap, but by saying 이상 있음.
 */
export function findSpotFlaws(shown: string, verse: string): SpotFlaws {
	const wrong = markMismatchedWords(shown, verse).flatMap((m, i) => (m.ok ? [] : [i]));
	const missing = markMismatchedWords(verse, shown).flatMap((m, i) => (m.ok ? [] : [i]));
	return { wrong, missing, flawed: wrong.length > 0 || missing.length > 0 };
}

/**
 * How often the round shows the verse as it really is.
 *
 * Not a tuning knob so much as the game: the queue only picks verses it has a
 * recorded attempt for, so every round used to show a flawed sentence and
 * 이상 있음 was right every single time. A reader who noticed that could clear
 * a session without reading a word. Planting the intact verse in about half of
 * them is what puts the question back.
 *
 * Half rather than a quarter: the reader is guessing against this number, and
 * anything far off a half is a coin they can learn the weight of.
 */
export const SPOT_CLEAN_SHARE = 0.5;

/**
 * The sentence this round puts on screen.
 *
 * Drawn once per round rather than per frame, and by the caller that builds
 * the run — a component that rolled at mount would roll again on every
 * re-render Svelte decided to do.
 */
export function spotShown(
	verse: string,
	attempt: string | undefined,
	rng: () => number = Math.random
): string {
	if (!attempt || attempt.trim().length === 0) return verse;
	return rng() < SPOT_CLEAN_SHARE ? verse : attempt;
}
