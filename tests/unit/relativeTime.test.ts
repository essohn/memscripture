import { describe, it, expect } from 'vitest';
import { relativeTimeKo, shortDateKo } from '../../src/lib/utils/relativeTime';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A fixed "now" so the assertions read as arithmetic rather than as a race. */
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const ago = (delta: number) => relativeTimeKo(NOW - delta, NOW);

describe('relativeTimeKo', () => {
	it('calls anything under a minute 방금 전', () => {
		expect(ago(0)).toBe('방금 전');
		expect(ago(59 * SEC)).toBe('방금 전');
	});

	it('counts minutes up to the hour', () => {
		expect(ago(MIN)).toBe('1분 전');
		expect(ago(59 * MIN)).toBe('59분 전');
	});

	it('counts hours up to the day', () => {
		expect(ago(HOUR)).toBe('1시간 전');
		expect(ago(23 * HOUR)).toBe('23시간 전');
	});

	it('counts days up to a month', () => {
		expect(ago(DAY)).toBe('1일 전');
		expect(ago(30 * DAY)).toBe('30일 전');
	});

	it('counts months up to a year', () => {
		expect(ago(31 * DAY)).toBe('1달 전');
		expect(ago(364 * DAY)).toBe('11달 전');
	});

	// A month is a twelfth of a year, not 30 days. Rounding it to 30 makes a
	// 364-day gap read as "12달 전", which is a year said the long way.
	it('never reports twelve months', () => {
		for (let d = 31; d <= 364; d++) expect(ago(d * DAY)).not.toBe('12달 전');
	});

	it('counts years past that', () => {
		expect(ago(365 * DAY)).toBe('1년 전');
		expect(ago(3 * 365 * DAY)).toBe('3년 전');
	});

	// checkHistory rows sync between devices with independent clocks, so a
	// record can arrive stamped slightly in the future. "-2분 전" would be the
	// card reporting the other device's clock drift as news about the reader.
	it('treats a future timestamp as just now', () => {
		expect(ago(-5 * MIN)).toBe('방금 전');
	});
});

// Built from local-time parts and read back as local time, so the assertions
// hold in whatever zone the suite runs in.
describe('shortDateKo', () => {
	it('prints the month, day and time', () => {
		expect(shortDateKo(new Date(2026, 7, 27, 15, 40).getTime())).toBe('8/27 15:40');
	});

	it('pads the day and the clock but not the month', () => {
		expect(shortDateKo(new Date(2026, 11, 3, 9, 5).getTime())).toBe('12/03 09:05');
	});

	it('prints midnight as 00:00 rather than 24:00', () => {
		expect(shortDateKo(new Date(2026, 0, 1, 0, 0).getTime())).toBe('1/01 00:00');
	});
});
