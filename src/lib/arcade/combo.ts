/**
 * The chain behind 자주 틀리는 곳 찾기's timed rounds.
 *
 * The game hands back a sentence the reader once wrote and asks whether it is
 * right. Deciding quickly is the skill worth rewarding — a reader who has to
 * stare at their own wording for half a minute has not really recognised it —
 * so answering inside the clock links rounds into a chain that pays more the
 * longer it runs.
 *
 * The clock gates the chain and nothing else. A late answer is still graded on
 * whether it was right, and still written to the check history that way: the
 * arcade may take a streak, never a verdict. A timer that could mark a verse
 * wrong would put pressure into a record that the difficulty ratings read.
 */

/**
 * What one round of each game is worth before the chain multiplies it.
 *
 * They differ because the rounds do. Calling a sentence right or wrong is one
 * decision; reciting a whole verse without a slip is the hardest thing the
 * quiz asks, and 시작 3단어 pays on its own clock (see raid.ts) because there
 * the speed is the game.
 */
export const SPOT_HIT_POINTS = 100;
export const PERFECT_POINTS = 300;

/** Where the chain stops paying more. */
export const COMBO_MAX_MULTIPLIER = 5;

/** Time to read a sentence of no length at all — the floor under every round. */
const COMBO_BASE_MS = 5_000;
/** Added per character. Korean prose reads at roughly five or six characters a
 *  second; this is a little slower, because the reader is not only reading it
 *  but holding it against what they remember. */
const COMBO_MS_PER_CHAR = 180;
/** However long the sentence, the bar has to stay a bar. */
const COMBO_MAX_MS = 30_000;

export function comboLimitMs(verseLength: number): number {
	return Math.min(COMBO_MAX_MS, COMBO_BASE_MS + Math.max(0, verseLength) * COMBO_MS_PER_CHAR);
}

export interface ComboState {
	/** Correct calls in a row, all of them inside the clock. */
	streak: number;
	/** The longest streak this session reached, kept once it breaks. */
	best: number;
	points: number;
}

export const NO_COMBO: ComboState = { streak: 0, best: 0, points: 0 };

/** Every second round is worth another multiple, up to the cap. */
export function comboMultiplier(streak: number): number {
	return Math.min(COMBO_MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, streak) / 2));
}

/**
 * A round the reader got right.
 *
 * `base` is what that round was worth on its own — a fast interception is
 * worth more than a slow one, and a perfect recitation more than either — and
 * the chain multiplies it. One chain serves all three games because a session
 * only ever plays one of them, so the multiplier always means "in a row at
 * this game" and never mixes two scales.
 */
export function comboHit(
	state: ComboState,
	opts: { inTime: boolean; base?: number }
): ComboState {
	const base = opts.base ?? SPOT_HIT_POINTS;
	if (!opts.inTime) {
		// Right, but the clock had run out. The points still land; the chain
		// does not, because a chain is what being quick every time earns.
		return { streak: 0, best: state.best, points: state.points + base };
	}
	const streak = state.streak + 1;
	return {
		streak,
		best: Math.max(state.best, streak),
		points: state.points + base * comboMultiplier(streak)
	};
}

export function comboMiss(state: ComboState): ComboState {
	return { streak: 0, best: state.best, points: state.points };
}
