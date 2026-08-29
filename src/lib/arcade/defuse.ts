import { remainingMs } from './clock';

/**
 * The clock behind 퍼펙트 게임.
 *
 * The round asks for a whole verse, so the pressure has to be a different
 * shape from 시작 3단어's: there the bomb falls and three words shoot it down,
 * here it sits on the desk counting, and finishing the verse defuses it.
 *
 * Running out submits whatever has been typed rather than inventing a verdict
 * of its own — the grade is then the real grade of what the reader actually
 * wrote, and nothing about the check history has to learn that a clock can
 * mark a verse wrong.
 */

/** Time to recall a verse of no length at all — the floor under every round. */
export const DEFUSE_BASE_MS = 20_000;
/**
 * Added per character.
 *
 * Slower than reading, and slower than typing: the reader is producing the
 * verse from memory, and a pace set by how fast thumbs move would be timing
 * the wrong thing. Roughly one character a second, which a reader who knows
 * the verse clears with room to spare and one who is reconstructing it does
 * not.
 */
export const DEFUSE_MS_PER_CHAR = 900;
/** The longest verse shipped is 224 characters. Past this the clock stops
 *  being pressure and becomes a number nobody watches. */
export const DEFUSE_MAX_MS = 150_000;
/** How much of the run the alarm covers. Long enough to still finish on. */
export const DEFUSE_ALARM_MS = 15_000;

export function defuseLimitMs(verseLength: number): number {
	return Math.min(
		DEFUSE_MAX_MS,
		DEFUSE_BASE_MS + Math.max(0, verseLength) * DEFUSE_MS_PER_CHAR
	);
}

export type DefusePhase = 'ticking' | 'alarm' | 'blown';

export function defusePhase(elapsedMs: number, limitMs: number): DefusePhase {
	if (elapsedMs >= limitMs) return 'blown';
	return remainingMs(elapsedMs, limitMs) <= DEFUSE_ALARM_MS ? 'alarm' : 'ticking';
}
