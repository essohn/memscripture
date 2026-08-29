import { elapsedShare, remainingMs } from './clock';

/**
 * The clock behind 시작 3단어 맞추기 게임's interception round.
 *
 * The round already asked for the verse's first three words. This gives that
 * ask a shape: a raider closes on the verse while the reader types, and
 * producing the opening shoots it down. Nothing about the grading changes —
 * running out of time is the same verdict 모르겠어요 already writes, reached
 * by the clock instead of by a button — so the arcade sits on top of the
 * memory game rather than replacing it.
 *
 * Pure, and separate from the canvas, because these are the rules: how long
 * the reader has, when the warning comes, and what a fast answer is worth.
 * The canvas only draws what they say.
 */

/**
 * How long before the raider arrives.
 *
 * Thirty seconds, against the check panel's own bands: 20s is where 첫 시작
 * 난이도 stops calling a recall Normal and 40s is where it stops calling it
 * Hard. A reader who cannot produce three words inside thirty has not got the
 * opening, and one who can is never rushed by this — the pressure is meant to
 * be felt at the end, not throughout. Korean input on a phone is slow, and a
 * limit that punished thumbs would be measuring the wrong thing.
 */
export const RAID_LIMIT_MS = 30_000;

/** How much of the run the alarm covers. Long enough to still act on. */
export const RAID_ALARM_MS = 10_000;

export type RaidPhase = 'inbound' | 'alarm' | 'impact';

/** 0 at the top of the board, 1 on the ground. */
export function raidApproach(elapsedMs: number, limitMs: number): number {
	return elapsedShare(elapsedMs, limitMs);
}

export function raidPhase(elapsedMs: number, limitMs: number): RaidPhase {
	if (elapsedMs >= limitMs) return 'impact';
	return remainingMs(elapsedMs, limitMs) <= RAID_ALARM_MS ? 'alarm' : 'inbound';
}

export function raidRemainingMs(elapsedMs: number, limitMs: number): number {
	return remainingMs(elapsedMs, limitMs);
}

/** Points for the hit itself, before any speed is counted. */
export const RAID_HIT_POINTS = 100;
/** The most a fast shot can add on top. */
export const RAID_SPEED_POINTS = 200;

/**
 * What shooting the raider down is worth, given the time left on the clock.
 *
 * The hit pays flat and the speed pays on top: this is a memory game first,
 * and a reader who took twenty-nine seconds still recalled the verse. Paying
 * only for speed would tell them the recall did not count.
 */
export function raidScore(remainingMs: number, limitMs: number): number {
	if (limitMs <= 0) return RAID_HIT_POINTS;
	const share = Math.min(1, Math.max(0, remainingMs / limitMs));
	return RAID_HIT_POINTS + Math.round(RAID_SPEED_POINTS * share);
}

/**
 * The band the bomb may come down in, as fractions of the board's width.
 *
 * Kept off both edges: half a sprite would hang off the board, and the beam
 * fired up at it would have nowhere to be drawn. Wide enough that two rounds
 * running look like two rounds rather than one rendering wobble.
 */
export const RAID_LANE_MIN = 0.25;
export const RAID_LANE_MAX = 0.75;

/** Where this round's bomb comes down. Drawn once per round, not per frame. */
export function raidLane(rng: () => number = Math.random): number {
	const draw = Math.min(1, Math.max(0, rng()));
	return RAID_LANE_MIN + draw * (RAID_LANE_MAX - RAID_LANE_MIN);
}
