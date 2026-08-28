import { describe, expect, it } from 'vitest';
import {
	RAID_ALARM_MS,
	RAID_LIMIT_MS,
	raidApproach,
	raidPhase,
	raidRemainingMs,
	raidScore
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
