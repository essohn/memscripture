import { describe, expect, it } from 'vitest';
import {
	GAMES,
	GAME_LABELS,
	OPENING_GAME_WORDS,
	OPENING_WORD_CHOICES,
	GAME_SOURCE,
	RECALLABLE_MIN_ACCURACY,
	isRecallableAttempt
} from '../../src/lib/quiz/games';

describe('games', () => {
	it('offers three games', () => {
		expect([...GAMES]).toEqual(['typing', 'opening', 'spot']);
	});

	it('labels each game in Korean', () => {
		expect(GAME_LABELS.typing).toBe('퍼펙트 게임');
		expect(GAME_LABELS.opening).toBe('시작 단어 맞추기 게임');
		expect(GAME_LABELS.spot).toBe('자주 틀리는 곳 찾기 게임');
	});

	// Each game proves something different: passing on two words is not
	// knowing the verse, and spotting a planted error is recognition rather
	// than recall. One shared source would light the 만점 badge for typing
	// two words.
	it('gives each game its own source', () => {
		expect(GAME_SOURCE.typing).toBe('quiz');
		expect(GAME_SOURCE.opening).toBe('quiz-opening');
		expect(GAME_SOURCE.spot).toBe('quiz-spot');
		expect(new Set(Object.values(GAME_SOURCE)).size).toBe(3);
	});
});

describe('isRecallableAttempt', () => {
	// A verse abandoned after two words is not a question anybody can answer.
	it('rejects an attempt that collapsed', () => {
		expect(isRecallableAttempt(0)).toBe(false);
		expect(isRecallableAttempt(0.5)).toBe(false);
	});

	it('accepts an attempt at the threshold', () => {
		expect(isRecallableAttempt(RECALLABLE_MIN_ACCURACY)).toBe(true);
	});

	it('rejects the value just below the threshold', () => {
		expect(isRecallableAttempt(RECALLABLE_MIN_ACCURACY - 0.01)).toBe(false);
	});

	// A perfect attempt has nothing wrong to find, so it is not a question.
	it('rejects a perfect attempt', () => {
		expect(isRecallableAttempt(1)).toBe(false);
	});
});

describe('opening word counts', () => {
	// The count is the game's difficulty dial, so it is a list of offered steps
	// rather than a constant — but three stays the default it always was.
	it('offers two through five, defaulting to three', () => {
		expect(OPENING_WORD_CHOICES).toEqual([2, 3, 4, 5]);
		expect(OPENING_GAME_WORDS).toBe(3);
	});

	it('has the default among the choices it offers', () => {
		expect(OPENING_WORD_CHOICES).toContain(OPENING_GAME_WORDS);
	});
});
