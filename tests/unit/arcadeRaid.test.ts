import { describe, expect, it } from 'vitest';
import {
	RAID_ALARM_MS,
	RAID_LIMIT_MS,
	raidApproach,
	raidPhase,
	raidRemainingMs,
	raidScore,
	raidLane,
	RAID_LANE_MIN,
	RAID_LANE_MAX,
	raidSlowAfterMs,
	raidWasSlow
} from '../../src/lib/arcade/raid';

describe('raidApproach', () => {
	// 0 is the horizon, 1 is overhead. The canvas reads this straight, so it
	// must never hand back a value it cannot draw.
	it('runs from the horizon to overhead', () => {
		expect(raidApproach(0, 1000)).toBe(0);
		expect(raidApproach(500, 1000)).toBe(0.5);
		expect(raidApproach(1000, 1000)).toBe(1);
	});

	it('stays inside the screen when the clock overruns', () => {
		expect(raidApproach(9999, 1000)).toBe(1);
		expect(raidApproach(-50, 1000)).toBe(0);
	});

	// A backgrounded tab hands back one enormous delta on return; a limit of
	// zero would divide by it.
	it('treats a limit of zero as already arrived', () => {
		expect(raidApproach(0, 0)).toBe(1);
	});
});

describe('raidPhase', () => {
	it('is inbound while there is room', () => {
		expect(raidPhase(0, RAID_LIMIT_MS)).toBe('inbound');
	});

	// The alarm is the game's only warning, and it has to arrive with enough
	// time left to act on: a siren that starts as the raider lands is noise.
	it('raises the alarm before the last moment', () => {
		expect(raidPhase(RAID_LIMIT_MS - RAID_ALARM_MS + 1, RAID_LIMIT_MS)).toBe('alarm');
		expect(RAID_ALARM_MS).toBeGreaterThanOrEqual(8_000);
	});

	it('is impact once the clock is out', () => {
		expect(raidPhase(RAID_LIMIT_MS, RAID_LIMIT_MS)).toBe('impact');
		expect(raidPhase(RAID_LIMIT_MS + 5_000, RAID_LIMIT_MS)).toBe('impact');
	});
});

describe('raidRemainingMs', () => {
	it('counts down and stops at zero', () => {
		expect(raidRemainingMs(0, 1000)).toBe(1000);
		expect(raidRemainingMs(400, 1000)).toBe(600);
		expect(raidRemainingMs(4000, 1000)).toBe(0);
	});
});

describe('raidScore', () => {
	// Landing the shot is worth something on its own — the game is a memory
	// game first, and a reader who took their time still recalled the verse.
	it('pays for the hit before it pays for the speed', () => {
		expect(raidScore(0, RAID_LIMIT_MS)).toBeGreaterThan(0);
	});

	it('pays more the earlier the shot lands', () => {
		const slow = raidScore(1_000, RAID_LIMIT_MS);
		const fast = raidScore(RAID_LIMIT_MS, RAID_LIMIT_MS);
		expect(fast).toBeGreaterThan(slow);
	});

	it('is a whole number of points', () => {
		for (const left of [0, 1234, 7777, RAID_LIMIT_MS]) {
			expect(Number.isInteger(raidScore(left, RAID_LIMIT_MS))).toBe(true);
		}
	});

	// A round the reader never shot down pays nothing, however fast the clock
	// says it went.
	it('never pays for a limit of zero', () => {
		expect(raidScore(0, 0)).toBeGreaterThan(0);
	});
});

describe('raidLane', () => {
	// The bomb used to come down the middle every round, which made the second
	// one look like a replay of the first.
	it('varies with the draw', () => {
		expect(raidLane(() => 0)).not.toBe(raidLane(() => 1));
	});

	// Never against an edge: half a sprite would hang off the board, and the
	// beam fired at it would have nowhere to be drawn.
	it('keeps clear of both edges', () => {
		for (const draw of [0, 0.001, 0.5, 0.999, 1]) {
			const lane = raidLane(() => draw);
			expect(lane).toBeGreaterThanOrEqual(RAID_LANE_MIN);
			expect(lane).toBeLessThanOrEqual(RAID_LANE_MAX);
		}
	});

	it('spans its whole band', () => {
		expect(raidLane(() => 0)).toBeCloseTo(RAID_LANE_MIN);
		expect(raidLane(() => 1)).toBeCloseTo(RAID_LANE_MAX);
	});

	// A band narrow enough to be pointless would be worse than no randomness:
	// it would look like a rendering wobble rather than a different round.
	it('is wide enough to read as a different round', () => {
		expect(RAID_LANE_MAX - RAID_LANE_MIN).toBeGreaterThanOrEqual(0.4);
	});
});

describe('raidWasSlow', () => {
	// The moment the alarm starts, so the rule is one the reader can watch
	// rather than one applied to them afterwards.
	it('starts counting as slow when the alarm does', () => {
		expect(raidSlowAfterMs(RAID_LIMIT_MS)).toBe(RAID_LIMIT_MS - RAID_ALARM_MS);
		expect(raidWasSlow(raidSlowAfterMs() - 1)).toBe(false);
		expect(raidWasSlow(raidSlowAfterMs() + 1)).toBe(true);
	});

	// Twenty seconds, which is where the check panel's own bands stop calling a
	// recall Normal — so 시작 난이도 means the same thing whichever screen
	// moved it.
	it('lands where the check panel stops calling a recall Normal', () => {
		expect(raidSlowAfterMs()).toBe(20_000);
	});

	it('calls a prompt answer prompt', () => {
		expect(raidWasSlow(0)).toBe(false);
		expect(raidWasSlow(5_000)).toBe(false);
	});

	// A limit shorter than the alarm would otherwise make every answer slow
	// before the round had begun.
	it('never calls an answer slow before any time has passed', () => {
		expect(raidWasSlow(0, 5_000)).toBe(false);
	});
});
