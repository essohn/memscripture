import { describe, expect, it } from 'vitest';
import { accuracySeries, difficultyTrend, effortTotals, FLAT_SLOPE } from '../../src/lib/memorize/diagnosis';
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

/** Ratings given newest-first, as records arrive. */
const rated = (...full: (number | null)[]) =>
	full.map((v, i) => record({ id: `r${i}`, full: v, start: v }));

describe('difficultyTrend', () => {
	// Two points can be drawn through by any line. Three is the least that can
	// disagree with one.
	it('declines to call a direction on fewer than three ratings', () => {
		expect(difficultyTrend(rated(4, 3), 'full')).toBe('unknown');
		expect(difficultyTrend(rated(4, null, 3), 'full')).toBe('unknown');
		expect(difficultyTrend([], 'full')).toBe('unknown');
	});

	// The scale runs 0=Impossible..5=xEasy, so a rising number is a verse
	// getting EASIER. newest-first input, so this reader went 2 → 3 → 4 → 5.
	it('calls a rising rating improving, because rising means easier', () => {
		expect(difficultyTrend(rated(5, 4, 3, 2), 'full')).toBe('improving');
	});

	it('calls a falling rating worsening', () => {
		expect(difficultyTrend(rated(2, 3, 4, 5), 'full')).toBe('worsening');
	});

	it('calls an unchanging rating flat', () => {
		expect(difficultyTrend(rated(3, 3, 3, 3), 'full')).toBe('flat');
	});

	// This is why the rule is a slope and not first-versus-last: one better
	// evening at the end of seven flat checks is not a direction. Slope here
	// is 3/28 ≈ 0.107, under FLAT_SLOPE.
	it('does not call a direction on one good evening at the end', () => {
		expect(FLAT_SLOPE).toBe(0.15);
		expect(difficultyTrend(rated(4, 3, 3, 3, 3, 3, 3), 'full')).toBe('flat');
	});

	// 포기 records no level at all. Skipping such a check must not shift the
	// series — the ratings that exist still happened in the order they did.
	it('skips unrated checks without disturbing the ones around them', () => {
		expect(difficultyTrend(rated(5, null, 4, null, 3), 'full')).toBe('improving');
	});

	it('reads the dimension it was asked for', () => {
		const records = [
			record({ id: 'a', start: 5, full: 1 }),
			record({ id: 'b', start: 4, full: 2 }),
			record({ id: 'c', start: 3, full: 3 })
		];
		expect(difficultyTrend(records, 'start')).toBe('improving');
		expect(difficultyTrend(records, 'full')).toBe('worsening');
	});
});
