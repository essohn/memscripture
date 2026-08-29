/** The three ways the quiz can ask about a verse. */
export type Game = 'typing' | 'opening' | 'spot';

/** In picker order. */
export const GAMES = ['typing', 'opening', 'spot'] as const satisfies readonly Game[];

export const GAME_LABELS: Record<Game, string> = {
	typing: '퍼펙트 게임',
	opening: '시작 단어 맞추기 게임',
	spot: '자주 틀리는 곳 찾기 게임'
};

/**
 * What a round of each game writes as its record's source.
 *
 * Three values rather than one because the games prove different things.
 * Passing on a verse's opening words does not mean the verse is known, and
 * spotting a planted error is recognition rather than recall — written as one
 * 'quiz', the 만점 badge would light for typing three words of it.
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

/**
 * The counts the reader can ask for instead.
 *
 * The bar is the game's difficulty, and how high it should be is a fact about
 * the reader rather than about the verse. Two is thin evidence for the reason
 * above and is offered anyway — someone working a set for the first time is
 * asking a different question than someone on their tenth pass. Five is most
 * of an opening clause and about as far as this game can go before it becomes
 * 퍼펙트 게임 with a shorter verse.
 */
export const OPENING_WORD_CHOICES = [2, 3, 4, 5] as const;
export type OpeningWords = (typeof OPENING_WORD_CHOICES)[number];

/**
 * Is this attempt worth keeping as a future 자주 틀리는 곳 찾기 question?
 *
 * Anything the confetti did not fire on. A perfect recitation has nothing
 * wrong in it to find and is the only thing excluded.
 *
 * There was a floor under this — 0.9 at first, then 0.6 — on the reasoning
 * that an attempt abandoned after a few words is a different sentence rather
 * than a wrong one, and handing it back to ask what is wrong with it is closer
 * to a blank than a question. That reasoning is not wrong, but it was being
 * paid for with the game itself: the reader had recorded twenty-one checks and
 * the game could ask about two of them. A thin question the reader can answer
 * beats a game with nothing in it, and the sentence is theirs either way —
 * seeing how little of a verse they once managed is its own kind of useful.
 *
 * A check that produced no text at all is still nothing to ask about, and that
 * is filtered where the text is read rather than here, which only sees the
 * score.
 */
export function isRecallableAttempt(accuracy: number): boolean {
	return accuracy < 1;
}
