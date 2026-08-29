# Check Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a read-only diagnosis above the 점검 기록 list — effort totals, an accuracy sparkline, two difficulty trends, and a heat map printed on the verse's own words — so the reader can see *where* a verse keeps failing without tallying ten attempts by hand.

**Architecture:** One pure module (`src/lib/memorize/diagnosis.ts`) derives everything from the `CheckRecord[]` the sheet already holds. Nothing is stored: no table, no field, no migration. One new presentational component (`CheckDiagnosis.svelte`) renders it, one shared pip component (`DifficultyDot.svelte`) is extracted so the summary and the rows beneath it cannot disagree, and two existing files thread one prop.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes (`$props`, `$derived`), TypeScript, Tailwind v4, Vitest + `@testing-library/svelte` (jsdom).

**Spec:** `docs/superpowers/specs/2026-08-29-check-diagnosis-design.md`

## Global Constraints

- **Branch:** `feat/check-diagnosis`, already cut. Baseline at start: **1588 tests across 114 files, all passing.** The suite must stay green after every task.
- **Test command:** `npx vitest run --maxWorkers=2 --testTimeout=20000`. The `--maxWorkers=2` is not optional — this suite times out random specs when the machine is busy, and a flaky red is worse than a slow green. Single file: `npx vitest run tests/unit/<file>.test.ts --maxWorkers=2 --testTimeout=20000`.
- **No new database field, table, or Dexie version.** Everything is derived on read.
- **`src/lib/memorize/` must not import from `src/lib/quiz/`.** Nothing does today and the dependency runs the other way. In particular, do **not** reuse `isRecallableAttempt` — see Task 3.
- **Records arrive newest-first** everywhere, as `listChecks()` returns them. Every function in `diagnosis.ts` takes them that way and reverses internally where chronology matters.
- **Korean UI copy is exact.** Copy the strings in this plan character for character; they are asserted in tests.
- **Heat tints go in plain `:root` in `src/app.css`, beside the ribbon palette — never inside `@theme`.** That block already documents why: Tailwind v4 shakes out tokens its static scanner cannot see, and a heat map that renders in dev and colourlessly in production is this feature's worst available failure.
- **Commit after every task** with the message given in the task's final step.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/memorize/diagnosis.ts` | create | Every derived number. Pure — no Dexie, no `Date.now()`, no Svelte. Mirrors `missStats.ts`. |
| `src/lib/components/card/DifficultyDot.svelte` | create | The coloured difficulty pip, extracted from `CheckHistorySheet`'s `level` snippet so summary and rows share one definition. |
| `src/lib/components/card/CheckDiagnosis.svelte` | create | Renders the four parts. Presentational — takes records and words, owns no state. |
| `src/lib/components/card/CheckHistorySheet.svelte` | modify | Gains a `words` prop; renders the diagnosis above the list; rows switch to `DifficultyDot`. |
| `src/lib/components/card/VerseCard.svelte` | modify | Threads its existing `words` array into the sheet. One line. |
| `src/app.css` | modify | Three heat tint tokens in `:root`. |
| `tests/unit/diagnosis.test.ts` | create | The pure module. |
| `tests/unit/CheckDiagnosis.test.ts` | create | The component. |
| `tests/unit/CheckHistorySheet.test.ts` | modify | New `words` prop in the mount helper; the diagnosis renders above the rows. |

Tasks 1–3 build `diagnosis.ts` one function group at a time. Task 4 is a pure refactor that must not change behaviour. Tasks 5–6 render and wire.

---

### Task 1: Effort totals and the accuracy series

The two functions with no judgement in them. They get the module born and set the newest-first convention every later function follows.

**Files:**
- Create: `src/lib/memorize/diagnosis.ts`
- Test: `tests/unit/diagnosis.test.ts`

**Interfaces:**
- Consumes: `CheckRecord` from `$lib/db/local`.
- Produces:
  - `MIN_RECORDS: 2`
  - `effortTotals(records: CheckRecord[]): { checks: number; hints: number; ms: number }`
  - `accuracySeries(records: CheckRecord[]): number[]` — oldest first

- [ ] **Step 1: Write the failing test**

Create `tests/unit/diagnosis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { accuracySeries, effortTotals } from '../../src/lib/memorize/diagnosis';
import type { CheckRecord } from '../../src/lib/db/local';

/** A 점검 row. Records are newest-first everywhere, the order listChecks
 *  returns them, so a list written here reads newest to oldest. */
export const record = (over: Partial<CheckRecord> = {}): CheckRecord => ({
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/diagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `Failed to resolve import "../../src/lib/memorize/diagnosis"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/memorize/diagnosis.ts`:

```ts
import type { CheckRecord } from '$lib/db/local';

/**
 * Records needed before the diagnosis says anything at all.
 *
 * One point is not a trend and one attempt is not a pattern. A summary drawn
 * over a single check would be the app asserting something it cannot know —
 * the same judgement hasEventStats makes when it declines to draw an empty
 * chart rather than drawing an honest-looking empty one.
 */
export const MIN_RECORDS = 2;

/**
 * What this verse has cost so far, across the records the sheet is showing.
 *
 * `hints` floors an absent count at 0. That is a real loss of meaning —
 * absent means the check predates the field, not that no hint was pressed —
 * but a sum has no way to carry "unknown" the way a rate does, so the choice
 * is between a floor and no line at all.
 */
export function effortTotals(records: CheckRecord[]): {
	checks: number;
	hints: number;
	ms: number;
} {
	let hints = 0;
	let ms = 0;
	for (const r of records) {
		hints += r.hints ?? 0;
		ms += r.elapsedMs;
	}
	return { checks: records.length, hints, ms };
}

/**
 * Accuracy per check, oldest first.
 *
 * Reversed here rather than at the call site because a chart reads left to
 * right and listChecks hands its rows back newest-first. Doing it once, in
 * the module that owns the convention, is one place to be wrong instead of
 * one per consumer.
 */
export function accuracySeries(records: CheckRecord[]): number[] {
	return records.map((r) => r.accuracy).reverse();
}
```

`.map()` builds a new array, so the `.reverse()` that follows mutates the copy and never the caller's list — which the test pins.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/diagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/diagnosis.ts tests/unit/diagnosis.test.ts
git commit -m "feat(diagnosis): what a verse has cost, and how its accuracy has moved"
```

---

### Task 2: The difficulty trend

The reader rates the verse at every 점검 and those ratings are already stored per record. This turns the sequence into one word.

**Files:**
- Modify: `src/lib/memorize/diagnosis.ts`
- Test: `tests/unit/diagnosis.test.ts`

**Interfaces:**
- Consumes: `record()` helper from Task 1's test file.
- Produces:
  - `FLAT_SLOPE: 0.15`
  - `type Trend = 'improving' | 'flat' | 'worsening' | 'unknown'`
  - `difficultyTrend(records: CheckRecord[], dim: 'start' | 'full'): Trend`

**Read this before writing the code:** the difficulty scale runs **0 = Impossible … 5 = xEasy**, so a *rising* number means an *easier* verse. `improving` is therefore a **positive** slope. Getting this backwards produces a feature that confidently tells the reader the opposite of the truth, and no test will catch it unless the test also states the direction — which the ones below do.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/diagnosis.test.ts` (and extend the import at the top to `import { accuracySeries, difficultyTrend, effortTotals, FLAT_SLOPE } from '../../src/lib/memorize/diagnosis';`):

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/diagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `difficultyTrend is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/memorize/diagnosis.ts`:

```ts
/**
 * Slope below which the reader's ratings are noise rather than a direction.
 *
 * 0.15 per check is roughly one level of movement across a seven-check
 * window. A tuning constant — exported so a test can state the number it is
 * pinning rather than encoding it in a fixture nobody can read.
 */
export const FLAT_SLOPE = 0.15;

export type Trend = 'improving' | 'flat' | 'worsening' | 'unknown';

/**
 * Which way this reader's own sense of the verse has been moving.
 *
 * Least squares over the rated checks, not first-versus-last: with a
 * six-value series a single generous evening at the end would otherwise flip
 * the verdict, and the reader's rating is a mood as much as a measurement.
 *
 * `improving` is a POSITIVE slope. DIFFICULTY_LEVELS runs 0=Impossible to
 * 5=xEasy, so the number going up is the verse getting easier. The component
 * says 쉬워지는 중 rather than 개선 for the same reason: naming the direction
 * the reader actually feels removes the inversion from everyone's head.
 */
export function difficultyTrend(records: CheckRecord[], dim: 'start' | 'full'): Trend {
	// Oldest first: a slope over positions is meaningless if the positions run
	// backwards, and it would silently invert every verdict.
	const values: number[] = [];
	for (let i = records.length - 1; i >= 0; i--) {
		const v = records[i][dim];
		// 포기 stores null, and a synced row from an older client could carry
		// anything; only a real level takes a position in the series.
		if (typeof v === 'number') values.push(v);
	}
	if (values.length < 3) return 'unknown';

	const n = values.length;
	const meanX = (n - 1) / 2;
	const meanY = values.reduce((a, b) => a + b, 0) / n;
	let covariance = 0;
	let variance = 0;
	for (let i = 0; i < n; i++) {
		covariance += (i - meanX) * (values[i] - meanY);
		variance += (i - meanX) ** 2;
	}
	// n >= 3 guarantees variance > 0, so there is no divide-by-zero branch to
	// write and none to leave untested.
	const slope = covariance / variance;

	if (Math.abs(slope) < FLAT_SLOPE) return 'flat';
	return slope > 0 ? 'improving' : 'worsening';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/diagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/diagnosis.ts tests/unit/diagnosis.test.ts
git commit -m "feat(diagnosis): which way the reader's own sense of a verse is moving"
```

---

### Task 3: The word heat map

The heart of the feature, and the one place it can lie. Read the failing test carefully before implementing — the first case is the whole reason this function is a rate and not a count.

**Files:**
- Modify: `src/lib/memorize/diagnosis.ts`
- Test: `tests/unit/diagnosis.test.ts`

**Interfaces:**
- Produces:
  - `MIN_REACH: 2`
  - `ASSUME_COMPLETE_MIN_ACCURACY: 0.5`
  - `type HeatTier = 'none' | 'rare' | 'sometimes' | 'often'`
  - `interface WordHeat { reached: number; missed: number; rate: number | null; tier: HeatTier }`
  - `wordHeat(records: CheckRecord[], wordCount: number): WordHeat[]` — one entry per word, in verse order

**Read this before writing the code.** `markMismatchedWords` walks the verse forward and stops matching where the attempt ran out, so **an attempt abandoned after five words reports every remaining word as missed**. A raw count would paint half the verse red on the strength of one surrender. Each word's denominator is therefore not "attempts" but "attempts that reached this word", recovered from the stored `typed`.

**Do not import `isRecallableAttempt` from `$lib/quiz/games`.** Its threshold is `RECALLABLE_MIN_ACCURACY = 0.9` and it excludes a perfect score, because it answers *"is this sentence a good 틀린 곳 찾기 puzzle"* — a rule of the game, as its own comment says, not a statement about how far a reader got. Reusing it would drop every flawless check and every honest 80% one from the heat map, and would make `memorize/` import from `quiz/` for the first time.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/diagnosis.test.ts` (extend the import to add `ASSUME_COMPLETE_MIN_ACCURACY, MIN_REACH, wordHeat`):

```ts
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

	it('has nothing to say about a verse with no words', () => {
		expect(wordHeat([record({ typed: '하나', missed: [0] })], 0)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/diagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `wordHeat is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/memorize/diagnosis.ts`:

```ts
/**
 * Attempts that must have reached a word before its colour means anything.
 *
 * Carries the same idea as SUGGEST_MIN_MISSES: one incident is an accident,
 * not a diagnosis. Without it a verse checked once after a long gap would
 * light up on a single slip.
 */
export const MIN_REACH = 2;

/**
 * Accuracy at or above which a check with no saved `typed` is assumed to have
 * reached the end of the verse.
 *
 * markMismatchedWords reports the whole unreached tail as wrong, so an
 * attempt abandoned halfway scores around half and an abandoned opening
 * scores near nothing. Above this line the attempt plausibly went the
 * distance and its misses are real misses; below it, nothing can be said.
 *
 * Deliberately NOT quiz/games' isRecallableAttempt, whose 0.9 threshold and
 * exclusion of a perfect score answer a different question — whether a
 * sentence makes a good 틀린 곳 찾기 puzzle. Borrowing it would drop every
 * flawless check from the heat map and weld this metric to a constant that
 * will be tuned for the quiz.
 */
export const ASSUME_COMPLETE_MIN_ACCURACY = 0.5;

export type HeatTier = 'none' | 'rare' | 'sometimes' | 'often';

export interface WordHeat {
	/** Attempts that got this far. */
	reached: number;
	/** Of those, how many got this word wrong. */
	missed: number;
	/** missed / reached, or null when nothing reached this word — which is a
	 *  different thing from a word nobody ever missed. */
	rate: number | null;
	tier: HeatTier;
}

/**
 * How many words into the verse this attempt reached.
 *
 * Approximated from the attempt's own token count, not recovered exactly.
 * markMismatchedWords walks a normalized character stream with a cursor, so
 * "which word did they stop at" is not a thing it reports and not a thing
 * this can ask it for. What is needed here is the denominator of a
 * three-step tint, not an audit trail, and the approximation errs in the
 * honest direction: a reader who typed fewer words than the verse holds did
 * produce less of it.
 *
 * `typed === ''` — saved having typed nothing — falls to the second branch
 * and yields 0, which is right: it reached no word.
 */
function reachOf(r: CheckRecord, wordCount: number): number {
	if (r.typed === undefined) {
		return r.accuracy >= ASSUME_COMPLETE_MIN_ACCURACY ? wordCount : 0;
	}
	return Math.min(wordCount, r.typed.trim().split(/\s+/).filter(Boolean).length);
}

function tierOf(reached: number, rate: number | null): HeatTier {
	if (rate === null || rate <= 0 || reached < MIN_REACH) return 'none';
	if (rate >= 2 / 3) return 'often';
	if (rate >= 1 / 3) return 'sometimes';
	return 'rare';
}

/**
 * How often each word of the verse has actually been got wrong.
 *
 * A rate rather than a count, because markMismatchedWords reports every word
 * past where an attempt stopped as missed — so counting raw misses would
 * paint the tail of the verse red on the strength of one surrender.
 *
 * Derived on every read rather than stored, on the terms suggestedMarks set:
 * a stored map would need a schema version, a merge rule, a decay policy and
 * an answer for an OYO verse edited under it, and worse, after the reader
 * fixes a word it would keep pointing at a place that is already fixed.
 */
export function wordHeat(records: CheckRecord[], wordCount: number): WordHeat[] {
	const reached = new Array<number>(Math.max(0, wordCount)).fill(0);
	const missed = new Array<number>(Math.max(0, wordCount)).fill(0);

	for (const r of records) {
		// Absent is not an empty array: this check predates the field and
		// measured nothing about positions, so counting its reach would score
		// every word as a clean run on evidence that does not exist.
		if (!r.missed) continue;

		const reach = reachOf(r, wordCount);
		for (let i = 0; i < reach; i++) reached[i]++;

		// Bounded by `reach`, which does two jobs at once: it drops the tail of
		// an abandoned attempt, and it drops an index past the end of an OYO
		// verse edited shorter than its own history.
		for (const i of new Set(r.missed)) {
			if (i < 0 || i >= reach) continue;
			missed[i]++;
		}
	}

	return reached.map((n, i) => {
		const rate = n === 0 ? null : missed[i] / n;
		return { reached: n, missed: missed[i], rate, tier: tierOf(n, rate) };
	});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/diagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS — 23 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run --maxWorkers=2 --testTimeout=20000`
Expected: PASS — 1611 tests across 115 files (1588 baseline + 23 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/memorize/diagnosis.ts tests/unit/diagnosis.test.ts
git commit -m "feat(diagnosis): where in the verse it keeps going wrong, as a rate not a count"
```

---

### Task 4: Extract the difficulty pip

A pure refactor. The summary and the rows beneath it must draw the same pip from the same definition, or they read as two different scales. Behaviour must not change — the existing `CheckHistorySheet` tests are the proof.

**Files:**
- Create: `src/lib/components/card/DifficultyDot.svelte`
- Modify: `src/lib/components/card/CheckHistorySheet.svelte` (the `level` snippet at the bottom, and its two `{@render}` call sites)
- Test: `tests/unit/CheckHistorySheet.test.ts` (existing assertions must keep passing unchanged)

**Interfaces:**
- Produces: `DifficultyDot` with props `{ label?: string; value: DifficultyLevel | null }`.

**Why `label` is optional.** Task 5's summary draws ten of these pips per dimension. If each carried `aria-label="첫 시작 난이도 4"` like the rows do, every existing `getByLabelText('첫 시작 난이도 2')` in `CheckHistorySheet.test.ts` would start matching two elements and throw. It is also worse for a screen reader: ten pips walked one at a time teach nothing about a trend. So the summary omits `label`, marks its pips `aria-hidden`, and names the whole sequence once on the group above them.

- [ ] **Step 1: Create the component**

Create `src/lib/components/card/DifficultyDot.svelte`, moving the markup verbatim out of `CheckHistorySheet.svelte`'s `level` snippet:

```svelte
<script lang="ts">
	import { DIFFICULTY_COLORS, type DifficultyLevel } from '$lib/db/verseRatings';

	interface Props {
		/** What this pip measures, spoken to a screen reader.
		 *
		 *  Omitted when the pip sits inside a group that already names the whole
		 *  sequence — ten pips walked one at a time teach a screen reader user
		 *  nothing about a trend, and ten copies of one label would also collide
		 *  with the rows that carry the same one. */
		label?: string;
		value: DifficultyLevel | null;
	}
	let { label, value }: Props = $props();
</script>

<!-- role="img" rather than a bare span: the colour and the digit together are
     the whole message, and a span's aria-label is not guaranteed to be read.
     Not a button — this is what the rating *was*, not a control to change it. -->
<span
	role={label ? 'img' : undefined}
	aria-label={label ? `${label} ${value ?? '없음'}` : undefined}
	aria-hidden={label ? undefined : 'true'}
	style={value === null
		? 'border: 1.5px dashed var(--color-border); color: var(--color-text-tertiary);'
		: `background-color: ${DIFFICULTY_COLORS[value]}; color: white;`}
	class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
>
	{value ?? '—'}
</span>
```

- [ ] **Step 2: Switch the sheet's rows to it**

In `src/lib/components/card/CheckHistorySheet.svelte`:

1. Add to the imports: `import DifficultyDot from './DifficultyDot.svelte';`
2. Replace the two `{@render level(...)}` calls with:

```svelte
					<span class="ml-auto flex items-center gap-1.5">
						<DifficultyDot label="첫 시작 난이도" value={h.start as DifficultyLevel | null} />
						<DifficultyDot label="전체 암송 난이도" value={h.full as DifficultyLevel | null} />
					</span>
```

3. Delete the entire `{#snippet level(label, value)}…{/snippet}` block at the bottom of the file, together with the three comment lines directly above it — that comment moved into the component.
4. `DIFFICULTY_COLORS` is now unused in this file; drop it from the `verseRatings` import, keeping `type DifficultyLevel`.

- [ ] **Step 3: Run the sheet's tests to verify nothing changed**

Run: `npx vitest run tests/unit/CheckHistorySheet.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS, with **no test file edits** — in particular `shows both difficulties recorded at the time` and `marks an ungraded check rather than inventing a level` still find `첫 시작 난이도 2` and `첫 시작 난이도 없음`. If either fails, the extraction changed behaviour; fix the component, not the test.

- [ ] **Step 4: Check types**

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: no new errors introduced by these two files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/card/DifficultyDot.svelte src/lib/components/card/CheckHistorySheet.svelte
git commit -m "refactor(card): one definition of the difficulty pip, so two places cannot disagree"
```

---

### Task 5: The diagnosis component

**Files:**
- Modify: `src/app.css` (three tokens in the existing `:root` block)
- Create: `src/lib/components/card/CheckDiagnosis.svelte`
- Test: `tests/unit/CheckDiagnosis.test.ts`

**Interfaces:**
- Consumes: everything from `diagnosis.ts` (Tasks 1–3), `DifficultyDot` (Task 4).
- Produces: `CheckDiagnosis` with props `{ records: CheckRecord[]; words: string[] }`.

**Test IDs this component must expose**, since Task 6 asserts on some of them: `check-diagnosis` (the block), `diagnosis-effort`, `diagnosis-heatmap`, `heat-word` (each word span, carrying `data-tier`), `trend-start`, `trend-full`.

- [ ] **Step 1: Add the tint tokens**

In `src/app.css`, inside the existing plain `:root` block that holds the ribbon palette (right after `--color-ribbon-purple`), add:

```css

	/**
	 * Word-heat tints for the 점검 diagnosis. Alpha over whatever sits behind
	 * them rather than opaque fills, so three values serve both themes and the
	 * text stays --color-text in each. Measured against --color-canvas: the
	 * strongest reads 7.3:1 on light (#fbf7f1 under #3a2e25) and 7.7:1 on dark
	 * (#1a1612 under #f0e6d2).
	 *
	 * Here rather than in @theme for the reason the ribbon palette gives
	 * above — a token the Tailwind scanner cannot see gets shaken out of the
	 * production build, and a heat map that renders in dev and colourlessly in
	 * production is the worst failure this feature has available to it.
	 */
	--color-heat-often: rgba(181, 101, 78, 0.42);
	--color-heat-sometimes: rgba(181, 101, 78, 0.24);
	--color-heat-rare: rgba(181, 101, 78, 0.12);
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/CheckDiagnosis.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CheckDiagnosis from '../../src/lib/components/card/CheckDiagnosis.svelte';
import type { CheckRecord } from '../../src/lib/db/local';

const WORDS = ['하나님이', '세상을', '이처럼', '사랑하사', '독생자를', '주셨으니'];
const FULL = WORDS.join(' ');

const record = (over: Partial<CheckRecord> = {}): CheckRecord => ({
	id: 'a',
	verseKey: '900_krv:1',
	packageId: '900_krv',
	verseNo: 1,
	checkedAt: 1_000_000,
	start: 3,
	full: 3,
	accuracy: 1,
	elapsedMs: 30_000,
	typed: FULL,
	missed: [],
	...over
});

const mount = (records: CheckRecord[], words = WORDS) =>
	render(CheckDiagnosis, { props: { records, words } });

const tierOfWord = (word: string) =>
	screen.getAllByTestId('heat-word').find((el) => el.textContent === word)?.dataset.tier;

describe('CheckDiagnosis', () => {
	// One point is not a trend and one attempt is not a pattern.
	it('says nothing about a single check', () => {
		mount([record()]);
		expect(screen.queryByTestId('check-diagnosis')).not.toBeInTheDocument();
	});

	it('says nothing at all with no checks', () => {
		mount([]);
		expect(screen.queryByTestId('check-diagnosis')).not.toBeInTheDocument();
	});

	it('reports what the verse has cost', () => {
		mount([
			record({ id: 'a', hints: 2, elapsedMs: 120_000 }),
			record({ id: 'b', hints: 5, elapsedMs: 300_000 })
		]);
		expect(screen.getByTestId('diagnosis-effort')).toHaveTextContent('최근 2회 · 힌트 7 · 7분');
	});

	// A "힌트 0" is a row of type spent saying nothing happened — the sheet's
	// own rows already omit it.
	it('omits the hint segment when no hint was spent', () => {
		mount([record({ id: 'a', elapsedMs: 20_000 }), record({ id: 'b', elapsedMs: 10_000 })]);
		expect(screen.getByTestId('diagnosis-effort')).toHaveTextContent('최근 2회 · 30초');
		expect(screen.getByTestId('diagnosis-effort')).not.toHaveTextContent('힌트');
	});

	it('tints a word by how often it was actually got wrong', () => {
		mount([
			record({ id: 'a', missed: [3] }),
			record({ id: 'b', missed: [3] }),
			record({ id: 'c', missed: [4] })
		]);
		expect(tierOfWord('사랑하사')).toBe('often'); // reached 3, missed 2 → exactly 2/3
		expect(tierOfWord('독생자를')).toBe('sometimes'); // reached 3, missed 1 → exactly 1/3
		expect(tierOfWord('하나님이')).toBe('none'); // reached 3, missed 0
	});

	// The paragraph is readable text, not an image: a screen reader should read
	// a verse as a verse. The tinted words are named once, afterwards.
	it('names the tinted words in a sentence rather than annotating each one', () => {
		mount([record({ id: 'a', missed: [3] }), record({ id: 'b', missed: [3] })]);
		expect(screen.getByTestId('diagnosis-heatmap')).not.toHaveAttribute('role', 'img');
		expect(screen.getByText('자주 틀린 곳: 사랑하사.')).toBeInTheDocument();
	});

	it('drops the heat map when nothing measured word positions', () => {
		mount([record({ id: 'a', missed: undefined }), record({ id: 'b', missed: undefined })]);
		expect(screen.getByTestId('check-diagnosis')).toBeInTheDocument();
		expect(screen.queryByTestId('diagnosis-heatmap')).not.toBeInTheDocument();
	});

	// Rising means easier, because the scale runs 0=Impossible..5=xEasy.
	it('reads a rising rating as the verse getting easier', () => {
		mount([
			record({ id: 'a', full: 5 }),
			record({ id: 'b', full: 4 }),
			record({ id: 'c', full: 3 }),
			record({ id: 'd', full: 2 })
		]);
		expect(screen.getByTestId('trend-full')).toHaveTextContent('쉬워지는 중');
	});

	it('draws no arrow when there is not enough rating to call a direction', () => {
		mount([record({ id: 'a', full: null }), record({ id: 'b', full: null })]);
		expect(screen.queryByTestId('trend-full')).not.toBeInTheDocument();
	});

	// A diagram, unlike the verse: named once, its pips hidden.
	it('names each difficulty sequence in one label', () => {
		mount([record({ id: 'a', full: 4 }), record({ id: 'b', full: null })]);
		expect(screen.getByLabelText('전체 난이도 변화: 없음, 4')).toBeInTheDocument();
	});

	it('names the accuracy sequence in one label', () => {
		mount([record({ id: 'a', accuracy: 0.87 }), record({ id: 'b', accuracy: 0.71 })]);
		expect(screen.getByLabelText('정확도 변화: 71%, 87%')).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/CheckDiagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — cannot resolve `CheckDiagnosis.svelte`.

- [ ] **Step 4: Write the component**

Create `src/lib/components/card/CheckDiagnosis.svelte`:

```svelte
<script lang="ts">
	import type { CheckRecord } from '$lib/db/local';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import DifficultyDot from './DifficultyDot.svelte';
	import {
		MIN_RECORDS,
		accuracySeries,
		difficultyTrend,
		effortTotals,
		wordHeat,
		type HeatTier,
		type Trend
	} from '$lib/memorize/diagnosis';

	interface Props {
		/** 점검 records, newest first — the same array the sheet lists below.
		 *  Deliberately the same, not a wider window: a summary that disagreed
		 *  with what it summarises is worse than no summary. */
		records: CheckRecord[];
		/** The verse's words, split exactly as markMismatchedWords indexes
		 *  them, so a tint lands on the word it describes. */
		words: string[];
	}
	let { records, words }: Props = $props();

	const shown = $derived(records.length >= MIN_RECORDS);
	const effort = $derived(effortTotals(records));
	const series = $derived(accuracySeries(records));
	const heat = $derived(wordHeat(records, words.length));

	/** Whether any record measured word positions at all. A history written
	 *  entirely before `missed` existed can still speak about effort and
	 *  difficulty, but has nothing to say about where the verse breaks. */
	const hasHeat = $derived(heat.some((h) => h.reached > 0));

	/** Oldest first, so a row of pips reads the same direction as the bars
	 *  above it and as time itself. */
	const chronological = $derived([...records].reverse());

	const DIMS = [
		{ dim: 'start' as const, label: '첫 시작' },
		{ dim: 'full' as const, label: '전체' }
	];

	const TRENDS: Record<Trend, string> = {
		improving: '↗ 쉬워지는 중',
		flat: '→ 그대로',
		worsening: '↘ 어려워지는 중',
		unknown: ''
	};

	const TIER_CLASS: Record<HeatTier, string> = {
		none: '',
		rare: 'heat-rare',
		sometimes: 'heat-sometimes',
		often: 'heat-often'
	};

	const TIER_LABEL: Record<HeatTier, string> = {
		none: '',
		rare: '드물게',
		sometimes: '가끔',
		often: '자주'
	};

	/**
	 * Bar height as a percent of the plot, floored so a bad check still draws.
	 *
	 * The ceiling is fixed at 1 rather than the series maximum, unlike
	 * EventStats: accuracy is already a proportion, and rescaling it to its own
	 * best value would draw a run of 40/45/50% as a climb to the top of the box.
	 * The floor is EventStats' idea though — a 4% check rendered true to scale
	 * is a fraction of a pixel, indistinguishable from a check that never
	 * happened.
	 */
	const MIN_BAR_PCT = 12;
	function barPct(accuracy: number): number {
		return Math.max(MIN_BAR_PCT, Math.min(1, Math.max(0, accuracy)) * 100);
	}

	function durationKo(ms: number): string {
		const seconds = Math.round(ms / 1000);
		return seconds < 60 ? `${seconds}초` : `${Math.round(seconds / 60)}분`;
	}

	const accuracyLabel = $derived(
		`정확도 변화: ${series.map((a) => `${Math.round(a * 100)}%`).join(', ')}`
	);

	function sequenceLabel(dim: 'start' | 'full'): string {
		return `${DIMS.find((d) => d.dim === dim)!.label} 난이도 변화: ${chronological
			.map((r) => r[dim] ?? '없음')
			.join(', ')}`;
	}

	/**
	 * The tinted words, named once after the verse rather than annotated one
	 * by one inside it.
	 *
	 * A role="img" on the paragraph would make its own word labels
	 * unreachable, and a bare span's aria-label is not reliably announced —
	 * CheckHistorySheet's pip comment already warns of exactly that. So the
	 * verse stays readable text and this sentence carries the diagnosis.
	 */
	const heatSummary = $derived(
		(['often', 'sometimes', 'rare'] as const)
			.map((tier) => ({
				tier,
				hit: words.filter((_, i) => heat[i]?.tier === tier)
			}))
			.filter((g) => g.hit.length > 0)
			.map((g) => `${TIER_LABEL[g.tier]} 틀린 곳: ${g.hit.join(', ')}.`)
			.join(' ')
	);
</script>

{#if shown}
	<div
		data-testid="check-diagnosis"
		class="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"
	>
		<p
			data-testid="diagnosis-effort"
			class="text-[11px] tabular-nums text-[var(--color-text-secondary)]"
		>최근 {effort.checks}회{#if effort.hints} · 힌트 {effort.hints}{/if} · {durationKo(effort.ms)}</p>

		<div class="mt-2 flex items-center gap-2">
			<span class="w-9 shrink-0 text-[11px] text-[var(--color-text-tertiary)]">정확도</span>
			<div role="img" aria-label={accuracyLabel} class="flex h-6 flex-1 items-end gap-[3px]">
				{#each series as accuracy, i (i)}
					<span
						data-testid="accuracy-bar"
						class="min-w-[3px] flex-1 rounded-sm bg-[var(--color-accent)]"
						style="height: {barPct(accuracy)}%"
					></span>
				{/each}
			</div>
		</div>

		{#each DIMS as d (d.dim)}
			{@const trend = difficultyTrend(records, d.dim)}
			<div class="mt-2 flex items-center gap-2">
				<span class="w-9 shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{d.label}</span>
				<span
					role="img"
					aria-label={sequenceLabel(d.dim)}
					class="flex min-w-0 flex-1 flex-wrap items-center gap-1"
				>
					{#each chronological as r (r.id)}
						<DifficultyDot value={r[d.dim] as DifficultyLevel | null} />
					{/each}
				</span>
				{#if trend !== 'unknown'}
					<span
						data-testid="trend-{d.dim}"
						class="shrink-0 text-[11px] text-[var(--color-text-secondary)]"
					>{TRENDS[trend]}</span>
				{/if}
			</div>
		{/each}

		{#if hasHeat}
			<p
				data-testid="diagnosis-heatmap"
				class="mt-3 break-keep border-t border-[var(--color-border)] pt-2.5 text-[13px] leading-[2] text-[var(--color-text)]"
			>{#each words as word, i (i)}<span
					data-testid="heat-word"
					data-tier={heat[i].tier}
					class="rounded-sm px-0.5 {TIER_CLASS[heat[i].tier]}"
				>{word}</span>{' '}{/each}</p>

			<!-- Tailwind's sr-only — off-screen rather than hidden, because
			     display:none and visibility:hidden are both skipped by screen
			     readers and would leave the tints with no textual equivalent at
			     all. Already used this way in library/[packageId] and
			     oyo/import/table. -->
			<p class="sr-only">{heatSummary}</p>

			<p class="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]" aria-hidden="true">
				<span class="heat-often rounded-sm px-1">자주</span>
				<span class="heat-sometimes rounded-sm px-1">가끔</span>
				<span class="heat-rare rounded-sm px-1">드물게</span>
				틀린 곳
			</p>
		{/if}
	</div>
{/if}

<style>
	/* Static class names, not an interpolated var(--color-heat-{tier}):
	   Tailwind v4 shakes out tokens its scanner cannot see, and these three
	   are declared in plain :root beside the ribbon palette for the same
	   reason. */
	.heat-often {
		background-color: var(--color-heat-often);
	}
	.heat-sometimes {
		background-color: var(--color-heat-sometimes);
	}
	.heat-rare {
		background-color: var(--color-heat-rare);
	}
</style>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/CheckDiagnosis.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS — 11 tests.

- [ ] **Step 6: Check types**

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app.css src/lib/components/card/CheckDiagnosis.svelte tests/unit/CheckDiagnosis.test.ts
git commit -m "feat(card): the diagnosis block, printed on the verse's own words"
```

---

### Task 6: Wire it into the sheet and the card

**Files:**
- Modify: `src/lib/components/card/CheckHistorySheet.svelte`
- Modify: `src/lib/components/card/VerseCard.svelte:1065-1069`
- Test: `tests/unit/CheckHistorySheet.test.ts`

**Interfaces:**
- Consumes: `CheckDiagnosis` (Task 5).
- Produces: `CheckHistorySheet` gains a **required** `words: string[]` prop.

`words` is required rather than defaulted to `[]`. A default would let a caller forget it and silently ship a sheet with no heat map, which is the failure mode hardest to notice in review.

- [ ] **Step 1: Write the failing test**

In `tests/unit/CheckHistorySheet.test.ts`, extend the mount helper to pass words, and add two cases:

```ts
const WORDS = ['하나님의', '말씀은', '살아', '있고', '활력이', '있어'];

const mount = (records: CheckRecord[], onClose = () => {}) =>
	render(CheckHistorySheet, {
		props: { heading: '히브리서 4:12', records, words: WORDS, now: NOW, onClose }
	});
```

and, inside the existing `describe('CheckHistorySheet', …)`:

```ts
	// The summary is the reason the sheet is worth opening; the rows are its
	// evidence. Evidence goes underneath.
	it('puts the diagnosis above the first row', () => {
		mount([
			record({ id: 'a', checkedAt: NOW - DAY, typed: WORDS.join(' '), missed: [2] }),
			record({ id: 'b', checkedAt: NOW - 2 * DAY, typed: WORDS.join(' '), missed: [2] })
		]);
		const diagnosis = screen.getByTestId('check-diagnosis');
		const firstRow = screen.getAllByTestId('check-history-row')[0];
		expect(diagnosis.compareDocumentPosition(firstRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it('shows the rows alone when there is only one check to show', () => {
		mount([record()]);
		expect(screen.queryByTestId('check-diagnosis')).not.toBeInTheDocument();
		expect(screen.getAllByTestId('check-history-row')).toHaveLength(1);
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/CheckHistorySheet.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: FAIL — `Unable to find an element by: [data-testid="check-diagnosis"]`.

- [ ] **Step 3: Render it in the sheet**

In `src/lib/components/card/CheckHistorySheet.svelte`:

1. Add the import: `import CheckDiagnosis from './CheckDiagnosis.svelte';`
2. Add to `Props`, above `now`:

```ts
		/** The verse's words, for the diagnosis heat map. Required rather than
		 *  defaulted: a caller who forgot it would ship a sheet with a silently
		 *  missing heat map, which is the hardest failure to notice in review. */
		words: string[];
```

3. Add `words` to the destructuring: `let { heading, records, words, now = Date.now(), onClose }: Props = $props();`
4. Replace the scrolling `<ul>` wrapper so the diagnosis scrolls away with the list rather than pinning — on a phone a pinned summary plus a sheet capped at `80vh` leaves too little room for the rows it is summarising. The `<ul>` keeps its rows and loses only its own scroll and padding:

```svelte
	<!-- Ten rows of verse-length text do not fit a phone, so the list scrolls
	     inside the sheet rather than growing it past the screen. The diagnosis
	     scrolls with it: pinned, it would eat the rows it summarises. -->
	<div class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
		<CheckDiagnosis {records} {words} />
		<ul class="space-y-3">
			<!-- …the existing {#each records as h (h.id)} block, unchanged… -->
		</ul>
	</div>
```

- [ ] **Step 4: Thread the prop from the card**

In `src/lib/components/card/VerseCard.svelte`, at the `CheckHistorySheet` usage (~line 1065), add `{words}`. `words` is already derived at line 175 as `verse.w.split(/\s+/).filter(Boolean)` — character for character the split `markMismatchedWords` indexes by, so no new computation and no risk of a tint landing on the wrong word:

```svelte
	<CheckHistorySheet
		heading={verse.cite}
		records={checkOnlyHistory}
		{words}
		onClose={() => (historyOpen = false)}
	/>
```

- [ ] **Step 5: Run the sheet's tests**

Run: `npx vitest run tests/unit/CheckHistorySheet.test.ts --maxWorkers=2 --testTimeout=20000`
Expected: PASS, including every pre-existing assertion.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npx vitest run --maxWorkers=2 --testTimeout=20000`
Expected: PASS — 1624 tests across 116 files (1588 baseline + 23 + 11 + 2).

Run: `npx svelte-check --threshold error --output human 2>&1 | tail -20`
Expected: no new errors. In particular, any other caller of `CheckHistorySheet` would surface here as a missing-prop error; there is only one today, but the check is what proves it.

- [ ] **Step 7: Verify it in a real browser**

Unit tests have shipped criticals on this codebase before — the quiz phases each passed a green suite and broke in the app. Run the dev server, open a verse with several 점검 records, and confirm by eye:

1. `npx vite dev` and open a package list.
2. Tap **최근 점검** on a verse with 2+ checks. The block appears above the rows.
3. The tinted words are actually tinted — **this is the production-build risk**, so also run `npx vite build && npx vite preview` and check the same verse there. A heat map that colours in dev and not in preview means the tokens landed in `@theme` instead of `:root`.
4. Toggle the theme. The 자주 tint stays legible under the verse text in both.
5. A verse with exactly one 점검 shows rows and no block.

- [ ] **Step 8: Commit and push**

```bash
git add src/lib/components/card/CheckHistorySheet.svelte src/lib/components/card/VerseCard.svelte tests/unit/CheckHistorySheet.test.ts
git commit -m "feat(card): the check history sheet opens on a diagnosis, not a list"
git push -u origin feat/check-diagnosis
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: 투입 한 줄 and the sparkline → Task 1 + 5; 난이도 변화 → Task 2 + 5; reach, the `missed`-absent rule, tiers, `MIN_REACH` → Task 3; the shared pip and its optional label → Task 4; placement, the `words` prop, the scroll decision → Task 6; the accessibility rules → Tasks 4 and 5; the `:root` tint requirement → Task 5 Step 1 and verified in Task 6 Step 7. The spec's edge-case table is covered by Task 3's tests except the two that are component-level (all-old history, single record), which are Task 5's.

**Placeholders.** None — every code step carries the actual code, and every test step the actual assertions.

**Type consistency.** `wordHeat`/`difficultyTrend`/`accuracySeries`/`effortTotals` are named identically in their defining task and at every use in Task 5. `HeatTier` values (`none`/`rare`/`sometimes`/`often`) match between Task 3's `tierOf`, Task 5's `TIER_CLASS`/`TIER_LABEL`, and the `data-tier` assertions. `Trend` values match between Task 2 and Task 5's `TRENDS`. `DifficultyDot`'s `{ label?, value }` matches both its call sites.

**Two things this review caught and fixed inline.** Task 5's tier test
expected `rare` for a word missed once in three reached attempts; 1/3 lands
exactly on the `sometimes` boundary that Task 3 defines, so the assertion is
now `sometimes` and the two tasks agree. And Task 5's component carried its
own `.sr-only` rule, which Tailwind already provides and
`library/[packageId]/+page.svelte` already uses — the hand-rolled copy is
gone.

**One number to re-derive during execution.** The running test totals (1611 / 1624) assume every test in this plan lands exactly as written. If a task adds or merges a case, the later counts shift — trust "all green, no new failures" over the arithmetic.
