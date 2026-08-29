import { describe, expect, it } from 'vitest';
import {
	DEFUSE_ALARM_MS,
	DEFUSE_MAX_MS,
	defuseLimitMs,
	defusePhase
} from '../../src/lib/arcade/defuse';

describe('defuseLimitMs', () => {
	// A whole verse under a flat clock would be generous for 예수께서 우시더라
	// and impossible for a 224-character one. The limit is the verse's own
	// length at a pace someone reciting from memory on a phone can hold.
	it('grows with the verse', () => {
		expect(defuseLimitMs(120)).toBeGreaterThan(defuseLimitMs(30));
	});

	it('gives even a short verse room to be recalled, not just typed', () => {
		expect(defuseLimitMs(10)).toBeGreaterThanOrEqual(20_000);
	});

	// The longest verse shipped is 224 characters. Past the cap the clock stops
	// being pressure and starts being a number nobody watches.
	it('stops at a length a reader can still feel', () => {
		expect(defuseLimitMs(10_000)).toBe(DEFUSE_MAX_MS);
	});

	// Slower than reading: the reader is producing the verse from memory, and a
	// pace set by typing speed would be timing their thumbs.
	it('allows at least half a second a character', () => {
		const perChar = (defuseLimitMs(100) - defuseLimitMs(0)) / 100;
		expect(perChar).toBeGreaterThanOrEqual(500);
	});
});

describe('defusePhase', () => {
	it('ticks while there is room', () => {
		expect(defusePhase(0, 60_000)).toBe('ticking');
	});

	it('raises the alarm with time still left to act on', () => {
		expect(defusePhase(60_000 - DEFUSE_ALARM_MS + 1, 60_000)).toBe('alarm');
		expect(DEFUSE_ALARM_MS).toBeGreaterThanOrEqual(8_000);
	});

	it('blows once the clock is out', () => {
		expect(defusePhase(60_000, 60_000)).toBe('blown');
		expect(defusePhase(99_000, 60_000)).toBe('blown');
	});
});
