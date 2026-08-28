import { describe, it, expect } from 'vitest';
import {
	perfectLabelKo,
	perfectOpacity,
	PERFECT_STEP_MS
} from '../../src/lib/utils/perfectFreshness';

const HOUR = 60 * 60 * 1000;

/** A fixed "now" so the assertions read as arithmetic rather than as a race. */
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const ago = (delta: number) => perfectOpacity(NOW - delta, NOW);

describe('perfectOpacity', () => {
	it('steps every 8 hours', () => {
		expect(PERFECT_STEP_MS).toBe(8 * HOUR);
	});

	it('is fully opaque for the first step', () => {
		expect(ago(0)).toBe(1);
		expect(ago(8 * HOUR - 1)).toBe(1);
	});

	it('drops one step at each 8-hour boundary', () => {
		expect(ago(8 * HOUR)).toBe(0.85);
		expect(ago(16 * HOUR)).toBe(0.7);
		expect(ago(24 * HOUR)).toBe(0.55);
		expect(ago(32 * HOUR)).toBe(0.4);
		expect(ago(40 * HOUR)).toBe(0.25);
	});

	it('holds the faintest step until the end of the last one', () => {
		expect(ago(48 * HOUR - 1)).toBe(0.25);
	});

	// null rather than 0: an icon at zero opacity still takes layout space and
	// is still announced by a screen reader. Gone has to mean not rendered.
	it('returns null once the last step is over', () => {
		expect(ago(48 * HOUR)).toBeNull();
		expect(ago(365 * 24 * HOUR)).toBeNull();
	});

	// checkHistory rows sync between devices with independent clocks, so a row
	// can arrive stamped in the future. Without the clamp that is a negative
	// step index, which reads off the front of the table as undefined.
	it('treats a timestamp from the future as brand new', () => {
		expect(ago(-5 * HOUR)).toBe(1);
	});
});

// The name is the only channel a reader who cannot see the fading has, so it
// has to resolve at least as finely as the fading does.
describe('perfectLabelKo', () => {
	const said = (delta: number) => perfectLabelKo(NOW - delta, NOW);

	it('says 방금 전 within the hour, as the rest of the app does', () => {
		expect(said(0)).toBe('방금 전');
		expect(said(20 * 60 * 1000)).toBe('20분 전');
	});

	it('counts hours through the first day', () => {
		expect(said(HOUR)).toBe('1시간 전');
		expect(said(18 * HOUR)).toBe('18시간 전');
	});

	// relativeTimeKo turns over to days here, which would report 1일 전 for
	// everything from 24h to the badge's death at 48h — one word covering the
	// last three of six steps.
	it('keeps counting hours past the first day, where the badge still lives', () => {
		expect(said(26 * HOUR)).toBe('26시간 전');
		expect(said(34 * HOUR)).toBe('34시간 전');
	});

	it('separates two steps that the day-scale would have collapsed', () => {
		expect(said(26 * HOUR)).not.toBe(said(34 * HOUR));
	});
});
