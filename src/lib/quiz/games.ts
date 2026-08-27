/** The three ways the quiz can ask about a verse. */
export type Game = 'typing' | 'opening' | 'spot';

/** In picker order. */
export const GAMES = ['typing', 'opening', 'spot'] as const satisfies readonly Game[];

export const GAME_LABELS: Record<Game, string> = {
	typing: '전체 타이핑',
	opening: '첫 단어',
	spot: '틀린 곳 찾기'
};

/**
 * What a round of each game writes as its record's source.
 *
 * Three values rather than one because the games prove different things.
 * Passing on two words does not mean the verse is known, and spotting a
 * planted error is recognition rather than recall — written as one 'quiz',
 * the 만점 badge would light for typing two words.
 */
export const GAME_SOURCE: Record<Game, 'quiz' | 'quiz-opening' | 'quiz-spot'> = {
	typing: 'quiz',
	opening: 'quiz-opening',
	spot: 'quiz-spot'
};

/** How close an attempt must land to be worth keeping as a future question. */
export const RECALLABLE_MIN_ACCURACY = 0.9;

/**
 * Is this attempt worth keeping as a future 틀린 곳 찾기 question?
 *
 * Near-misses only. A verse abandoned after two words is not a
 * spot-the-difference question, and a perfect attempt has nothing wrong in it
 * to find — the point of keeping the sentence is to hand it back later and ask
 * what is wrong with it.
 */
export function isRecallableAttempt(accuracy: number): boolean {
	return accuracy >= RECALLABLE_MIN_ACCURACY && accuracy < 1;
}
