import { describe, expect, it } from 'vitest';
import { accuracySeries, ASSUME_COMPLETE_MIN_ACCURACY, difficultyTrend, effortTotals, FLAT_SLOPE, MIN_REACH, wordHeat } from '../../src/lib/memorize/diagnosis';
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

/** An eight-word verse, so a give-up has a tail worth protecting. */
const WORDS = 8;
const tiers = (records: CheckRecord[]) => wordHeat(records, WORDS).map((h) => h.tier);

describe('wordHeat', () => {
	// The whole reason this is a rate. markMismatchedWords reports every
	// unreached word as missed, so a single abandoned attempt would otherwise
	// dye the tail of the verse red.
	it('does not let an abandoned attempt paint the words it never reached', () => {
		const full = (id: string) =>
			record({ id, typed: '하나 둘 셋 넷 다섯 여섯 일곱 여덟', missed: [3] });
		const gaveUp = record({
			id: 'gave-up',
			typed: '하나 둘 셋',
			missed: [3, 4, 5, 6, 7],
			accuracy: 0.3
		});
		const heat = wordHeat([full('a'), gaveUp, full('b')], WORDS);

		// Word 3 was genuinely missed by both attempts that reached it.
		expect(heat[3]).toMatchObject({ reached: 2, missed: 2, rate: 1, tier: 'often' });
		// Word 5 sits in the abandoned tail. Two attempts reached it, neither
		// got it wrong, and the surrender says nothing about it.
		expect(heat[5]).toMatchObject({ reached: 2, missed: 0, rate: 0, tier: 'none' });
	});

	// A saved-but-empty attempt reached no word, so it is evidence about none.
	it('gives an empty attempt no say', () => {
		expect(wordHeat([record({ typed: '', missed: [] })], WORDS)[0]).toMatchObject({
			reached: 0,
			rate: null,
			tier: 'none'
		});
	});

	// A check from before `typed` existed cannot report how far it went. A
	// good score went essentially the whole way; anything else is dropped
	// rather than guessed at, because guessing that a surrender reached the
	// end is the exact lie this metric exists to prevent.
	it('assumes a well-scored check with no saved text went the distance', () => {
		expect(ASSUME_COMPLETE_MIN_ACCURACY).toBe(0.5);
		const heat = wordHeat(
			[
				record({ id: 'a', typed: undefined, accuracy: 1, missed: [] }),
				record({ id: 'b', typed: undefined, accuracy: 0.6, missed: [2] })
			],
			WORDS
		);
		expect(heat[2]).toMatchObject({ reached: 2, missed: 1 });
	});

	it('drops a badly-scored check with no saved text entirely', () => {
		const heat = wordHeat([record({ typed: undefined, accuracy: 0.2, missed: [2] })], WORDS);
		expect(heat[2]).toMatchObject({ reached: 0, missed: 0, rate: null });
	});

	// Absent is not an empty array. A record written before `missed` existed
	// measured nothing about positions; letting it contribute reach alone
	// would score every word as a clean run on evidence that does not exist.
	it('lets a pre-feature record contribute neither reach nor misses', () => {
		const heat = wordHeat([record({ missed: undefined, typed: '하나 둘 셋 넷' })], WORDS);
		expect(heat[0]).toMatchObject({ reached: 0, rate: null });
	});

	// One incident is an accident, not a diagnosis.
	it('says nothing about a word only one attempt has reached', () => {
		expect(MIN_REACH).toBe(2);
		const heat = wordHeat([record({ typed: '하나 둘 셋 넷 다섯 여섯 일곱 여덟', missed: [1] })], WORDS);
		expect(heat[1]).toMatchObject({ reached: 1, missed: 1, rate: 1, tier: 'none' });
	});

	it('tiers at exactly one third and two thirds', () => {
		const clean = (id: string) => record({ id, typed: '하나 둘 셋 넷 다섯 여섯 일곱 여덟', missed: [] });
		const missing = (id: string) =>
			record({ id, typed: '하나 둘 셋 넷 다섯 여섯 일곱 여덟', missed: [1] });

		// 1 of 3 → exactly 1/3
		expect(tiers([missing('a'), clean('b'), clean('c')])[1]).toBe('sometimes');
		// 2 of 3 → exactly 2/3
		expect(tiers([missing('a'), missing('b'), clean('c')])[1]).toBe('often');
		// 1 of 4 → 0.25
		expect(tiers([missing('a'), clean('b'), clean('c'), clean('d')])[1]).toBe('rare');
	});

	// markMismatchedWords returns one entry per position, so a repeat would be
	// a caller bug — and counting it twice would report a rate above 1.
	it('counts a repeated index inside one record once', () => {
		const heat = wordHeat(
			[
				record({ id: 'a', typed: '하나 둘 셋 넷 다섯 여섯 일곱 여덟', missed: [4, 4] }),
				record({ id: 'b', typed: '하나 둘 셋 넷 다섯 여섯 일곱 여덟', missed: [] })
			],
			WORDS
		);
		expect(heat[4]).toMatchObject({ reached: 2, missed: 1, rate: 0.5, tier: 'sometimes' });
	});

	// An OYO verse can be edited shorter than the history describing it.
	it('discards an index past the end of the verse', () => {
		expect(() => wordHeat([record({ typed: '하나 둘', missed: [9] })], 2)).not.toThrow();
		expect(wordHeat([record({ typed: '하나 둘', missed: [9] })], 2)).toHaveLength(2);
	});

	// suggestedMarks drops assisted checks before taking its window, on the
	// grounds that a check made with the words on screen is not evidence that
	// the reader knows the verse. Two features reading these same records with
	// two different rules about 힌트 would dot one set of words and tint
	// another.
	it('ignores a check the reader took hints on', () => {
		const full = '하나 둘 셋 넷 다섯 여섯 일곱 여덟';
		const heat = wordHeat(
			[
				record({ id: 'clean', typed: full, missed: [] }),
				record({ id: 'assisted', typed: full, missed: [1], hints: 3 })
			],
			WORDS
		);
		expect(heat[1]).toMatchObject({ reached: 1, missed: 0 });
	});

	// Truthy, not defined: an absent field predates the feature and a zero is a
	// check that spent none. Both are unassisted and both must still count.
	it('still counts a check that pressed 힌트 zero times', () => {
		const full = '하나 둘 셋 넷 다섯 여섯 일곱 여덟';
		const heat = wordHeat(
			[
				record({ id: 'zero', typed: full, missed: [1], hints: 0 }),
				record({ id: 'absent', typed: full, missed: [1] })
			],
			WORDS
		);
		expect(heat[1]).toMatchObject({ reached: 2, missed: 2, tier: 'often' });
	});

	it('has nothing to say about a verse with no words', () => {
		expect(wordHeat([record({ typed: '하나', missed: [0] })], 0)).toEqual([]);
	});
});
