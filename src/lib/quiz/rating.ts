import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { Game } from './games';

/**
 * What a missed quiz round does to the verse's rating.
 *
 * A round going wrong is evidence, and the quiz was throwing it away: the
 * ratings only ever moved when the reader graded themselves in the check
 * panel, so a verse could be missed in the quiz every day of the week and go
 * on being filed as xEasy.
 */

/** Which rating each game is answering about. */
export type QuizDimension = 'start' | 'full';

/**
 * A miss lands on the dimension the round actually tested.
 *
 * 시작 3단어 says nothing about reciting the whole verse — it is the reason
 * the three games write three different sources in the first place — so a miss
 * there marks down 첫 시작 and leaves 전체 alone. 자주 틀리는 곳 찾기 shows a
 * whole sentence and asks about the whole sentence, so it lands on 전체 even
 * though what it proves is recognition rather than recall.
 */
export const GAME_DIMENSION: Record<Game, QuizDimension> = {
	typing: 'full',
	opening: 'start',
	spot: 'full'
};

/**
 * Where an unrated verse falls from.
 *
 * Normal, the middle. An unrated verse is not known to be hard, and it is not
 * known to be easy either — starting it at xEasy would say the second, and
 * leaving it unrated would mean most of a library never moves at all, since a
 * verse is only rated by being checked.
 */
export const UNRATED_DROPS_FROM: DifficultyLevel = 3;

/** The rating a verse is left with after a missed round. */
export function droppedRating(current: DifficultyLevel | null): DifficultyLevel {
	const from = current ?? UNRATED_DROPS_FROM;
	// 0 is Impossible and the bottom of the scale: a verse already there stays
	// there rather than wrapping or throwing.
	return Math.max(0, from - 1) as DifficultyLevel;
}

/** Whether the drop would move anything — false only at the bottom. */
export function ratingWouldChange(current: DifficultyLevel | null): boolean {
	return droppedRating(current) !== current;
}
