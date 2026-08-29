import { describe, expect, it } from 'vitest';
import {
	GAME_DIMENSION,
	UNRATED_DROPS_FROM,
	droppedRating,
	ratingWouldChange
} from '../../src/lib/quiz/rating';
import { GAMES } from '../../src/lib/quiz/games';

describe('droppedRating', () => {
	it('takes a rated verse down one step', () => {
		expect(droppedRating(5)).toBe(4);
		expect(droppedRating(3)).toBe(2);
		expect(droppedRating(1)).toBe(0);
	});

	// 0 is Impossible, the bottom of the scale. There is nowhere below it, and
	// wrapping or throwing would both be worse than staying.
	it('stops at the bottom of the scale', () => {
		expect(droppedRating(0)).toBe(0);
	});

	// An unrated verse has no step to come down from. It is not known to be
	// hard, but a round just went wrong on it, so it starts where the scale
	// says nothing either way and moves one toward hard.
	it('starts an unrated verse in the middle and moves it', () => {
		expect(UNRATED_DROPS_FROM).toBe(3);
		expect(droppedRating(null)).toBe(2);
	});
});

describe('ratingWouldChange', () => {
	it('is true wherever there is room to fall', () => {
		expect(ratingWouldChange(5)).toBe(true);
		expect(ratingWouldChange(1)).toBe(true);
		expect(ratingWouldChange(null)).toBe(true);
	});

	// Nothing to show and nothing to write.
	it('is false at the bottom', () => {
		expect(ratingWouldChange(0)).toBe(false);
	});
});

describe('GAME_DIMENSION', () => {
	// Each game is answered about one dimension, and a miss has to land on the
	// one it actually tested: 시작 3단어 says nothing about reciting the whole
	// verse, and marking 전체 down for it would be recording evidence the round
	// never gathered.
	it('sends each game to the rating it tested', () => {
		expect(GAME_DIMENSION.typing).toBe('full');
		expect(GAME_DIMENSION.opening).toBe('start');
		expect(GAME_DIMENSION.spot).toBe('full');
	});

	it('has an answer for every game', () => {
		for (const game of GAMES) expect(GAME_DIMENSION[game]).toBeDefined();
	});
});
