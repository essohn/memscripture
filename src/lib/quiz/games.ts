/** The three ways the quiz can ask about a verse. */
export type Game = 'typing' | 'opening' | 'spot';

/** In picker order. */
export const GAMES = ['typing', 'opening', 'spot'] as const satisfies readonly Game[];

export const GAME_LABELS: Record<Game, string> = {
	typing: '퍼펙트 게임',
	opening: '시작 3단어 맞추기 게임',
	spot: '자주 틀리는 곳 찾기 게임'
};

/**
 * What a round of each game writes as its record's source.
 *
 * Three values rather than one because the games prove different things.
 * Passing on the first three words does not mean the verse is known, and
 * spotting a planted error is recognition rather than recall — written as one
 * 'quiz', the 만점 badge would light for typing three words.
 */
export const GAME_SOURCE: Record<Game, 'quiz' | 'quiz-opening' | 'quiz-spot'> = {
	typing: 'quiz',
	opening: 'quiz-opening',
	spot: 'quiz-spot'
};

/**
 * How many of the verse's opening words 첫 단어 asks for.
 *
 * Three, not the two the card's 첫 시작 clock stops at. That clock is timing
 * the moment recall arrives and wants the earliest honest one; this game is
 * grading, and two words is thin evidence — plenty of verses open on the same
 * 그러므로 내가 or 여호와께서 이르시되, so a two-word bar can be cleared by a
 * phrase belonging to a dozen of them. By the third word it is this verse.
 *
 * Kept here rather than in timing.ts because it is a rule of the game, not a
 * property of the verse.
 */
export const OPENING_GAME_WORDS = 3;

/** How close an attempt must land to be worth keeping as a future question. */
export const RECALLABLE_MIN_ACCURACY = 0.9;

/**
 * Is this attempt worth keeping as a future 틀린 곳 찾기 question?
 *
 * Near-misses only. A verse abandoned after its opening words is not a
 * spot-the-difference question, and a perfect attempt has nothing wrong in it
 * to find — the point of keeping the sentence is to hand it back later and ask
 * what is wrong with it.
 */
export function isRecallableAttempt(accuracy: number): boolean {
	return accuracy >= RECALLABLE_MIN_ACCURACY && accuracy < 1;
}
