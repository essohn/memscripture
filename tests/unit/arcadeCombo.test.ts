import { describe, expect, it } from 'vitest';
import {
	COMBO_MAX_MULTIPLIER,
	NO_COMBO,
	SPOT_HIT_POINTS,
	comboHit,
	comboLimitMs,
	comboMiss,
	comboMultiplier
} from '../../src/lib/arcade/combo';

describe('comboLimitMs', () => {
	// The clock has to cover reading the sentence at all, and a long verse
	// takes longer to read than a short one. A flat limit would be generous
	// for 여호와여 and impossible for a 60-character sentence.
	it('grows with the sentence', () => {
		expect(comboLimitMs(80)).toBeGreaterThan(comboLimitMs(20));
	});

	it('gives even the shortest verse time to be read', () => {
		expect(comboLimitMs(0)).toBeGreaterThanOrEqual(5_000);
	});

	// Long enough to read twice and still decide; not so long the bar stops
	// meaning anything.
	it('stays inside a bound a bar can show', () => {
		expect(comboLimitMs(10_000)).toBeLessThanOrEqual(30_000);
	});
});

describe('comboMultiplier', () => {
	it('starts at one and climbs on a chain', () => {
		expect(comboMultiplier(0)).toBe(1);
		expect(comboMultiplier(1)).toBe(1);
		expect(comboMultiplier(2)).toBe(2);
		expect(comboMultiplier(4)).toBe(3);
	});

	it('is capped, so a long run cannot run away with the score', () => {
		expect(comboMultiplier(999)).toBe(COMBO_MAX_MULTIPLIER);
	});
});

describe('comboHit', () => {
	it('extends the chain and pays at its multiplier', () => {
		const one = comboHit(NO_COMBO, { inTime: true });
		expect(one).toEqual({ streak: 1, best: 1, points: SPOT_HIT_POINTS });

		const two = comboHit(one, { inTime: true });
		expect(two.streak).toBe(2);
		expect(two.points).toBe(SPOT_HIT_POINTS + SPOT_HIT_POINTS * 2);
	});

	// The clock gates the chain, not the answer. A reader who was right but
	// slow still read the sentence correctly, and the round is still graded on
	// that — the arcade takes the streak, never the verdict.
	it('pays a late answer, but breaks the chain', () => {
		const three = comboHit(comboHit(comboHit(NO_COMBO, { inTime: true }), { inTime: true }), {
			inTime: true
		});
		const late = comboHit(three, { inTime: false });
		expect(late.streak).toBe(0);
		expect(late.points).toBe(three.points + SPOT_HIT_POINTS);
	});

	it('remembers the longest chain even after it breaks', () => {
		const two = comboHit(comboHit(NO_COMBO, { inTime: true }), { inTime: true });
		expect(comboMiss(two).best).toBe(2);
		expect(comboHit(comboMiss(two), { inTime: true }).best).toBe(2);
	});
});

describe('comboMiss', () => {
	it('pays nothing and resets the chain', () => {
		const two = comboHit(comboHit(NO_COMBO, { inTime: true }), { inTime: true });
		const missed = comboMiss(two);
		expect(missed.streak).toBe(0);
		expect(missed.points).toBe(two.points);
	});
});

describe('comboHit — base', () => {
	// A fast interception is worth more than a slow one before any chain is
	// counted, so the round says what it was worth and the chain multiplies it.
	it('multiplies what the round was worth', () => {
		const one = comboHit(NO_COMBO, { inTime: true, base: 250 });
		expect(one.points).toBe(250);
		expect(comboHit(one, { inTime: true, base: 250 }).points).toBe(250 + 500);
	});

	it('falls back to a flat point when a round names no value', () => {
		expect(comboHit(NO_COMBO, { inTime: true }).points).toBe(SPOT_HIT_POINTS);
	});

	it('pays a late answer its own value, unmultiplied', () => {
		expect(comboHit(NO_COMBO, { inTime: false, base: 250 }).points).toBe(250);
	});
});
