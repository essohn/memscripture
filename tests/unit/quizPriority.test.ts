import { describe, expect, it } from 'vitest';
import {
	FAIL_WEIGHT,
	PRIORITY_WINDOW,
	STALE_CAP,
	priorityOf,
	signalOf,
	type VerseSignal
} from '../../src/lib/quiz/priority';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

/** A record as the rule sees it. `at` is days before NOW. */
function rec(
	accuracy: number,
	at: number,
	hints?: number
): { accuracy: number; checkedAt: number; hints?: number } {
	return { accuracy, checkedAt: NOW - at * DAY, ...(hints === undefined ? {} : { hints }) };
}

describe('signalOf', () => {
	it('reports nothing for a verse with no records', () => {
		expect(signalOf([])).toEqual({ fails: 0, lastAskedAt: undefined });
	});

	it('counts a check that missed a word as a failure', () => {
		expect(signalOf([rec(0.98, 1)]).fails).toBe(1);
	});

	it('does not count a flawless check as a failure', () => {
		expect(signalOf([rec(1, 1)]).fails).toBe(0);
	});

	it('consults only the most recent PRIORITY_WINDOW records', () => {
		// Six failures; only five are in the window.
		const history = [0, 1, 2, 3, 4, 5].map((d) => rec(0, d));
		expect(signalOf(history).fails).toBe(PRIORITY_WINDOW);
	});

	it('takes the window from the newest records regardless of input order', () => {
		// Oldest-first input: five passes then, older still, one failure.
		const history = [rec(0, 9), ...[0, 1, 2, 3, 4].map((d) => rec(1, d))];
		expect(signalOf(history).fails).toBe(0);
	});

	it('drops assisted records before taking the window, not after', () => {
		// Two real failures, then five hinted checks on top. Slicing first
		// would flush both failures out of the window and report zero.
		const history = [...[0, 1, 2, 3, 4].map((d) => rec(1, d, 3)), rec(0, 5), rec(0, 6)];
		expect(signalOf(history).fails).toBe(2);
	});

	it('treats a record with no hints field as unassisted', () => {
		expect(signalOf([rec(0, 1)]).fails).toBe(1);
	});

	it('treats zero hints as unassisted', () => {
		expect(signalOf([rec(0, 1, 0)]).fails).toBe(1);
	});

	it('takes lastAskedAt from the newest record, assisted ones included', () => {
		const history = [rec(0, 5), rec(1, 0, 4)];
		expect(signalOf(history).lastAskedAt).toBe(NOW);
	});
});

describe('priorityOf', () => {
	it('scores a verse never asked about at STALE_CAP', () => {
		expect(priorityOf({ fails: 0 }, NOW)).toBe(STALE_CAP);
	});

	it('scores a verse passed today at zero', () => {
		expect(priorityOf({ fails: 0, lastAskedAt: NOW }, NOW)).toBe(0);
	});

	it('pays FAIL_WEIGHT per failure', () => {
		expect(priorityOf({ fails: 3, lastAskedAt: NOW }, NOW)).toBe(3 * FAIL_WEIGHT);
	});

	it('adds a day of staleness per elapsed day', () => {
		expect(priorityOf({ fails: 0, lastAskedAt: NOW - 10 * DAY }, NOW)).toBe(10);
	});

	it('caps staleness at STALE_CAP', () => {
		expect(priorityOf({ fails: 0, lastAskedAt: NOW - 400 * DAY }, NOW)).toBe(STALE_CAP);
	});

	it('never lets a record stamped ahead of the clock subtract from a score', () => {
		expect(priorityOf({ fails: 2, lastAskedAt: NOW + 5 * DAY }, NOW)).toBe(2 * FAIL_WEIGHT);
	});

	it('ranks the spec\'s worked examples in the order the spec lists them', () => {
		const cases: [string, VerseSignal, number][] = [
			['failed 5 of 5, asked today', { fails: 5, lastAskedAt: NOW }, 35],
			['never asked', { fails: 0 }, 30],
			['passed 5 of 5, 60 days ago', { fails: 0, lastAskedAt: NOW - 60 * DAY }, 30],
			['failed 2 of 5, 10 days ago', { fails: 2, lastAskedAt: NOW - 10 * DAY }, 24],
			['passed 5 of 5, asked today', { fails: 0, lastAskedAt: NOW }, 0]
		];
		for (const [, signal, score] of cases) expect(priorityOf(signal, NOW)).toBe(score);

		const scores = cases.map(([, s]) => priorityOf(s, NOW));
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
	});
});
