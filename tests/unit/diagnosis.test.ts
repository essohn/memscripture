import { describe, expect, it } from 'vitest';
import { accuracySeries, effortTotals } from '../../src/lib/memorize/diagnosis';
import type { CheckRecord } from '../../src/lib/db/local';

/** A 점검 row. Records are newest-first everywhere, the order listChecks
 *  returns them, so a list written here reads newest to oldest. */
const record = (over: Partial<CheckRecord> = {}): CheckRecord => ({
	id: '900_krv:1:1000:0',
	verseKey: '900_krv:1',
	packageId: '900_krv',
	verseNo: 1,
	checkedAt: 1_000_000,
	start: 3,
	full: 3,
	accuracy: 1,
	elapsedMs: 30_000,
	...over
});

describe('effortTotals', () => {
	it('counts nothing out of nothing', () => {
		expect(effortTotals([])).toEqual({ checks: 0, hints: 0, ms: 0 });
	});

	it('sums the checks, the hints and the time', () => {
		const totals = effortTotals([
			record({ id: 'a', hints: 2, elapsedMs: 30_000 }),
			record({ id: 'b', hints: 5, elapsedMs: 90_000 })
		]);
		expect(totals).toEqual({ checks: 2, hints: 7, ms: 120_000 });
	});

	// Absent hints predate the field. They are not evidence that no hint was
	// pressed, but there is nothing else to add for them either — unlike the
	// heat map, a sum has no way to say "unknown", so the honest floor is 0.
	it('treats an absent hint count as zero', () => {
		expect(effortTotals([record({ hints: undefined })]).hints).toBe(0);
	});
});

describe('accuracySeries', () => {
	it('turns newest-first records into an oldest-first series', () => {
		const series = accuracySeries([
			record({ id: 'new', accuracy: 0.9 }),
			record({ id: 'mid', accuracy: 0.7 }),
			record({ id: 'old', accuracy: 0.4 })
		]);
		expect(series).toEqual([0.4, 0.7, 0.9]);
	});

	it('does not mutate its input', () => {
		const records = [record({ id: 'a', accuracy: 0.2 }), record({ id: 'b', accuracy: 0.8 })];
		accuracySeries(records);
		expect(records.map((r) => r.id)).toEqual(['a', 'b']);
	});

	it('has nothing to plot for no records', () => {
		expect(accuracySeries([])).toEqual([]);
	});
});
