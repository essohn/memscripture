import { DIFFICULTY_LEVELS, type DifficultyLevel } from '$lib/db/verseRatings';

/** Which rating the next digit fills. */
export type RatingCursor = 'start' | 'full';

/** The two ratings a check confirmation asks for, plus where typing is. */
export interface RatingEntry {
	start: DifficultyLevel | null;
	full: DifficultyLevel | null;
	cursor: RatingCursor;
}

/** A single digit key, and only if the scale has that level.
 *
 *  Matched as a digit before it is converted, because Number(' ') is 0 and the
 *  space bar is not a rating of Impossible. */
function levelOf(key: string): DifficultyLevel | null {
	if (!/^[0-9]$/.test(key)) return null;
	const n = Number(key);
	return DIFFICULTY_LEVELS.includes(n as DifficultyLevel) ? (n as DifficultyLevel) : null;
}

/**
 * The entry after one keystroke, or null when the key means nothing here.
 *
 * Null rather than an unchanged entry, deliberately: the caller uses it to
 * decide whether to consume the keystroke. Swallowing everything would take
 * Tab, Escape and the browser's own keys away from a reader whose hands are on
 * the keyboard precisely because they are not using the mouse.
 *
 * Digits run left to right — 첫 시작, then 전체 — and once both are set a
 * further digit replaces 전체 rather than being dropped: at that point the
 * reader is fixing the number they just typed, and refusing it would send them
 * to the mouse for the one thing this exists to avoid.
 *
 * Backspace undoes the last filled rating at or before the cursor and leaves
 * the cursor there, so it walks back exactly the way the digits walked
 * forward. It makes no distinction between a rating typed and one the app
 * proposed after 제출 — both are just what the badge currently reads.
 */
export function applyRatingKey(entry: RatingEntry, key: string): RatingEntry | null {
	const level = levelOf(key);
	if (level !== null) {
		return entry.cursor === 'start'
			? { start: level, full: entry.full, cursor: 'full' }
			: { start: entry.start, full: level, cursor: 'full' };
	}

	if (key === 'Backspace') {
		if (entry.cursor === 'full' && entry.full !== null) {
			return { start: entry.start, full: null, cursor: 'full' };
		}
		if (entry.start !== null) return { start: null, full: entry.full, cursor: 'start' };
		return null;
	}

	return null;
}
