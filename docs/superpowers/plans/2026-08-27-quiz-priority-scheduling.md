# Quiz Priority Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank a quiz scope by what the reader keeps getting wrong and how long it has been, then ask about the top ten.

**Architecture:** A pure rule (`src/lib/quiz/priority.ts`) reduces each verse's recent records to two numbers and scores them. One bulk history read in `checkHistory.ts` feeds it. `resolveTarget` becomes the joiner and returns the reduced maps, which lets a second existing read (`loadAttempts`) collapse into the same scan and lets two async `$effect`/run-token guards be deleted. `buildQueue` splits into a tier filter and a ranker.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Dexie/IndexedDB, Vitest + @testing-library/svelte, `fake-indexeddb/auto`.

**Spec:** `docs/superpowers/specs/2026-08-27-quiz-priority-scheduling-design.md`

## Global Constraints

- **No new stored state.** No new `CheckRecord` field, no Dexie version bump. `db.version(8)` stays. Everything is computed from records already written.
- **Never average the four sources' `accuracy`.** Pass is the single test `accuracy >= 1`, used as a verdict. `quiz-opening`'s 1 means "started it" and `quiz-spot`'s 1 means "found it"; a mean over the four is a defect.
- **Assisted means `hints` is truthy.** Both `undefined` and `0` count as unassisted.
- **Filter assisted records *before* slicing a window, never after.**
- **`now` is always a parameter.** No `Date.now()` inside `priority.ts` or `session.ts`.
- **Constants, verbatim:** `PRIORITY_WINDOW = 5`, `FAIL_WEIGHT = 7`, `STALE_CAP = 30`, `SESSION_SIZE = 10`.
- **Korean UI strings, verbatim:** `48구절 중 오늘 10구절` (the numbers interpolated), `7구절` (the number interpolated), `10구절 중 2개에 내 오답 기록이 있습니다` (both numbers interpolated), `고른 범위에 구절이 없습니다`, `아직 내 오답 기록이 없어 출제할 문제가 없습니다`, `난이도 그룹 선택`.
- **Comments explain *why*, not *what*.** Match the density and voice of the surrounding files — see `checkHistory.ts` and `missStats.ts`.
- **Baseline:** 1496 tests / 109 files green on `origin/main` @ `5981092`. Every task ends green.
- **Commands:** `pnpm test` runs the suite; `pnpm test <path>` runs one file; `pnpm check` type-checks. Both must pass before every commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/quiz/priority.ts` | **New.** The rule, pure: what a signal is, how records reduce to one, how a signal scores. Knows nothing about Dexie, Svelte or games. |
| `src/lib/db/checkHistory.ts` | Gains `listRecentChecks` — one range scan per package, grouped by verse. I/O only, no judgement. |
| `src/lib/memorize/missStats.ts` | `suggestedMarks` drops assisted records before slicing its window. Closes Phase 1's open question. |
| `src/lib/quiz/scope.ts` | `resolveTarget` becomes the joiner: scan → signals + attempts. `loadAttempts` is replaced by a pure `newestAttempt` over already-read rows. |
| `src/lib/quiz/session.ts` | `filterByTier` (tier narrowing) and `buildQueue` (rank + cap + eligibility). |
| `src/lib/components/quiz/QuizScopePicker.svelte` | Purely presentational: no `$effect`, no I/O, three new props. |
| `src/routes/quiz/+page.svelte` | Stamps `now` on pick, passes the new props, loses `runVersion` and the spot read. |

---

### Task 1: The priority rule

**Files:**
- Create: `src/lib/quiz/priority.ts`
- Test: `tests/unit/quizPriority.test.ts`

**Interfaces:**
- Consumes: `CheckRecord` from `$lib/db/local` (type only).
- Produces:
  - `PRIORITY_WINDOW: 5`, `FAIL_WEIGHT: 7`, `STALE_CAP: 30`, `SESSION_SIZE: 10`
  - `interface VerseSignal { fails: number; lastAskedAt?: number }`
  - `signalOf(history: Pick<CheckRecord, 'accuracy' | 'hints' | 'checkedAt'>[]): VerseSignal`
  - `priorityOf(signal: VerseSignal, now: number): number`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/quizPriority.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/quizPriority.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/quiz/priority"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/quiz/priority.ts`:

```ts
import type { CheckRecord } from '$lib/db/local';

/**
 * How many recent unassisted records the rule consults.
 *
 * The same number missStats.SUGGEST_WINDOW uses, and for the same reason:
 * five checks back is recent enough to still be true about this reader.
 */
export const PRIORITY_WINDOW = 5;

/** What one failure is worth, in days of neglect. */
export const FAIL_WEIGHT = 7;

/**
 * The most staleness alone may contribute.
 *
 * A month untouched and three months untouched are not different in any way
 * the reader would act on, and without a cap an ancient verse would outrank
 * one that fails every single time.
 */
export const STALE_CAP = 30;

/** How many verses one session asks about. */
export const SESSION_SIZE = 10;

const DAY_MS = 86_400_000;

/** What the rule needs to know about one verse. */
export interface VerseSignal {
	/** Failures among the recent unassisted records. */
	fails: number;
	/** When anything last asked about this verse. Absent if nothing ever has. */
	lastAskedAt?: number;
}

/**
 * Did this record pass?
 *
 * One test for all four sources, and deliberately a verdict rather than a
 * measurement. 점검 and 전체 타이핑 write a real proportion; 첫 단어 writes 1
 * for "started it" and 틀린 곳 찾기 writes 1 for "found it". Compared against
 * 1 each is exactly right — averaged together they are nonsense, because two
 * words typed correctly is not 98% of a verse.
 *
 * A 점검 at 0.98 is a failure here. That is the point: the reader got
 * something wrong, which is what 자주 틀린다 means.
 */
function passed(r: Pick<CheckRecord, 'accuracy'>): boolean {
	return r.accuracy >= 1;
}

/**
 * Did the reader lean on 힌트 for this one?
 *
 * Truthy, so both an absent field and a zero count as unassisted — the first
 * predates the hints feature and rejecting it would discard most of the
 * history, the second is a check where 힌트 was never pressed.
 */
function assisted(r: Pick<CheckRecord, 'hints'>): boolean {
	return Boolean(r.hints);
}

/**
 * Reduce one verse's records to the two numbers the score needs.
 *
 * Assisted records are dropped *before* the window is taken. Slicing first
 * would let a reader who checks a hard verse with hints five times flush
 * every real failure out of the window and watch their weakest verse sink to
 * the bottom — the same trap listPerfectVerseNos avoids by filtering before
 * it picks the latest.
 *
 * An assisted record is not evidence in either direction, so it neither
 * raises nor lowers the score. It does still set lastAskedAt: the reader put
 * the verse in front of themselves, whatever they leaned on to get through
 * it.
 *
 * Input order is not assumed. listRecentChecks hands these over newest-first,
 * but a caller that reads rows straight off an index gets them in index
 * order, and a rule that silently depends on the difference is a rule that
 * breaks when someone adds a second caller.
 */
export function signalOf(
	history: Pick<CheckRecord, 'accuracy' | 'hints' | 'checkedAt'>[]
): VerseSignal {
	let lastAskedAt: number | undefined;
	for (const r of history) {
		if (lastAskedAt === undefined || r.checkedAt > lastAskedAt) lastAskedAt = r.checkedAt;
	}

	const window = history
		.filter((r) => !assisted(r))
		.sort((a, b) => b.checkedAt - a.checkedAt)
		.slice(0, PRIORITY_WINDOW);

	return { fails: window.filter((r) => !passed(r)).length, lastAskedAt };
}

/**
 * How badly this verse wants to be asked about. Higher goes first.
 *
 * Two signals because the reader asked for two things. Failures answer
 * 자주 틀리는 구절의 우선순위를 높여서; staleness answers 계속 체크대상이
 * 되도록 — without it a verse passed twice would never come back at all.
 *
 * `now` is a parameter rather than a Date.now() inside, so that every verse
 * in one session is ranked against one instant and the tests are not
 * clock-dependent.
 */
export function priorityOf(signal: VerseSignal, now: number): number {
	const stale =
		signal.lastAskedAt === undefined
			? STALE_CAP
			: // Clamped at zero: a record stamped ahead of the clock — a device
				// whose time was wrong, a row that synced from one — must not
				// subtract from a score built on failures it knows nothing about.
				Math.min(Math.max(0, Math.floor((now - signal.lastAskedAt) / DAY_MS)), STALE_CAP);

	return signal.fails * FAIL_WEIGHT + stale;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/quizPriority.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm check
git add src/lib/quiz/priority.ts tests/unit/quizPriority.test.ts
git commit -m "feat(quiz): what makes a verse worth asking about again"
```

---

### Task 2: Assisted checks stop evicting underline suggestions

**Files:**
- Modify: `src/lib/memorize/missStats.ts:32-49`
- Test: `tests/unit/missStats.test.ts`

**Interfaces:**
- Produces: `suggestedMarks(history: Pick<CheckRecord, 'missed' | 'hints'>[], wordCount: number): Set<number>` — the parameter type widens from `Pick<CheckRecord, 'missed'>[]`. Both existing call sites pass full `CheckRecord`s, so nothing else changes.

This closes the question the Phase 1 spec recorded as Open. It is the same rule Task 1 applies, in the same shape, one file over.

- [ ] **Step 1: Write the failing test**

Append to the `describe('suggestedMarks', ...)` block in `tests/unit/missStats.test.ts`:

```ts
	// The question Phase 1 left open. A hinted clean check writes missed: []
	// and used to occupy a slot in the window; five of them would push both
	// earned misses out and silently retract a suggestion the reader had
	// already earned. Assisted records are dropped before the slice now, for
	// the same reason the quiz's priority rule drops them.
	it('does not let assisted checks evict an earned suggestion', () => {
		const assisted = [1, 2, 3, 4, 5].map(() => ({ missed: [] as number[], hints: 2 }));
		const earned = [{ missed: [2] }, { missed: [2] }];
		expect(suggestedMarks([...assisted, ...earned], 11)).toEqual(new Set([2]));
	});

	it('still counts a check where 힌트 was never pressed', () => {
		expect(suggestedMarks([{ missed: [2], hints: 0 }, { missed: [2] }], 11)).toEqual(
			new Set([2])
		);
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/missStats.test.ts`
Expected: FAIL on the first new test — `Set(0) {}` received, `Set(1) { 2 }` expected. The second new test passes already; it is there to lock that `hints: 0` keeps counting once the filter lands.

- [ ] **Step 3: Write the implementation**

In `src/lib/memorize/missStats.ts`, change the signature and the loop head:

```ts
export function suggestedMarks(
	history: Pick<CheckRecord, 'missed' | 'hints'>[],
	wordCount: number
): Set<number> {
	if (wordCount <= 0) return new Set();

	const tally = new Map<number, number>();
	// Assisted checks are dropped before the window is taken, not after. A
	// check made with the words on screen is not evidence that the reader
	// knows the verse — grade.ts says the same thing about difficulty — and
	// letting five of them fill the window would retract a suggestion the
	// reader had already earned. Truthy, so an absent field (predating the
	// feature) and a zero (힌트 never pressed) both count as unassisted.
	for (const record of history.filter((r) => !r.hints).slice(0, SUGGEST_WINDOW)) {
```

The rest of the function body is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/unit/missStats.test.ts tests/unit/checkHistory.test.ts`
Expected: PASS. The existing `missStats` tests build records with only `missed`, so they read as unassisted and keep their current results.

- [ ] **Step 5: Type-check, run the full suite, commit**

```bash
pnpm check && pnpm test
git add src/lib/memorize/missStats.ts tests/unit/missStats.test.ts
git commit -m "fix(memorize): a hinted check may not retract an earned suggestion"
```

---

### Task 3: One bulk history read

**Files:**
- Modify: `src/lib/db/checkHistory.ts` — add `listRecentChecks` after `listChecks`
- Test: `tests/unit/checkHistory.test.ts`

**Interfaces:**
- Consumes: `db`, `CheckRecord`, `HISTORY_LIMIT` — all already in the file.
- Produces: `listRecentChecks(packageIds: string[]): Promise<Map<string, CheckRecord[]>>` — keyed by `verseKey` (`${packageId}:${verseNo}`), each list newest-first and capped at `HISTORY_LIMIT`. Verses with no records are absent from the map.

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `tests/unit/checkHistory.test.ts`. Read the top of that file first for its existing `beforeEach` and helpers; write records with `db.checkHistory.add` in the same shape the file already uses.

```ts
describe('listRecentChecks', () => {
	async function add(packageId: string, verseNo: number, checkedAt: number, accuracy = 1) {
		await db.checkHistory.add({
			id: `${packageId}:${verseNo}:${checkedAt}`,
			verseKey: `${packageId}:${verseNo}`,
			packageId,
			verseNo,
			checkedAt,
			start: null,
			full: null,
			accuracy,
			elapsedMs: 1000
		});
	}

	it('returns nothing for a package with no history', async () => {
		expect(await listRecentChecks(['a_krv'])).toEqual(new Map());
	});

	it('groups records under their verseKey', async () => {
		await add('a_krv', 1, 100);
		await add('a_krv', 2, 100);
		const out = await listRecentChecks(['a_krv']);
		expect([...out.keys()].sort()).toEqual(['a_krv:1', 'a_krv:2']);
	});

	it('orders each verse newest first', async () => {
		await add('a_krv', 1, 100);
		await add('a_krv', 1, 300);
		await add('a_krv', 1, 200);
		const rows = (await listRecentChecks(['a_krv'])).get('a_krv:1');
		expect(rows?.map((r) => r.checkedAt)).toEqual([300, 200, 100]);
	});

	it('caps a verse at HISTORY_LIMIT, keeping the newest', async () => {
		for (let i = 0; i < HISTORY_LIMIT + 4; i++) await add('a_krv', 1, 100 + i);
		const rows = (await listRecentChecks(['a_krv'])).get('a_krv:1');
		expect(rows).toHaveLength(HISTORY_LIMIT);
		expect(rows?.[0]?.checkedAt).toBe(100 + HISTORY_LIMIT + 3);
	});

	it('keeps two packages\' verse 1 apart', async () => {
		await add('a_krv', 1, 100);
		await add('b_krv', 1, 200);
		const out = await listRecentChecks(['a_krv', 'b_krv']);
		expect(out.get('a_krv:1')?.[0]?.checkedAt).toBe(100);
		expect(out.get('b_krv:1')?.[0]?.checkedAt).toBe(200);
	});

	it('does not read a package it was not asked for', async () => {
		await add('a_krv', 1, 100);
		await add('b_krv', 1, 200);
		expect([...(await listRecentChecks(['a_krv'])).keys()]).toEqual(['a_krv:1']);
	});

	it('reads a repeated package id once', async () => {
		await add('a_krv', 1, 100);
		const rows = (await listRecentChecks(['a_krv', 'a_krv'])).get('a_krv:1');
		expect(rows).toHaveLength(1);
	});
});
```

Add `listRecentChecks` to that file's existing import from `../../src/lib/db/checkHistory` — `HISTORY_LIMIT` is already imported there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: FAIL — `listRecentChecks is not a function` / no exported member.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/db/checkHistory.ts`, directly after `listChecks`:

```ts
/**
 * Recent records for a whole set of packages at once, keyed by verseKey and
 * newest first.
 *
 * One range scan per package rather than a query per verse, the same shape
 * listLastCheckedAt and listPerfectVerseNos use: a 900-verse package would
 * otherwise issue 900 round-trips to rank a queue of ten.
 *
 * Capped per verse at HISTORY_LIMIT, matching listChecks — prune already
 * bounds what is stored, so this cap is a promise about the return type
 * rather than a filter that usually does anything.
 *
 * No judgement here beyond recency: which records count as evidence is the
 * priority rule's business, and mixing the two would put the definition of a
 * failure inside a database read.
 */
export async function listRecentChecks(
	packageIds: string[]
): Promise<Map<string, CheckRecord[]>> {
	const out = new Map<string, CheckRecord[]>();

	for (const packageId of new Set(packageIds)) {
		const rows = await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray();
		for (const r of rows) {
			const list = out.get(r.verseKey);
			if (list) list.push(r);
			else out.set(r.verseKey, [r]);
		}
	}

	for (const list of out.values()) {
		// Rows arrive in index order, not chronological order.
		list.sort((a, b) => b.checkedAt - a.checkedAt);
		if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
	}

	return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm check
git add src/lib/db/checkHistory.ts tests/unit/checkHistory.test.ts
git commit -m "feat(db): read a whole scope's history in one scan"
```

---

### Task 4: `resolveTarget` becomes the joiner

**Files:**
- Modify: `src/lib/quiz/scope.ts` — `resolveTarget` return type and body; replace `loadAttempts` with `newestAttempt`
- Test: `tests/unit/quizScope.test.ts`

**Interfaces:**
- Consumes: `listRecentChecks(packageIds: string[]): Promise<Map<string, CheckRecord[]>>` (Task 3); `signalOf(history): VerseSignal` and `type VerseSignal` (Task 1); `isRecallableAttempt(accuracy: number): boolean` (already imported in this file).
- Produces:
  - `resolveTarget(target: Target): Promise<{ items: QuizItem[]; ratings: Map<string, ItemRating>; signals: Map<string, VerseSignal>; attempts: Map<string, string> }>`
  - `newestAttempt(rows: Pick<CheckRecord, 'typed' | 'accuracy'>[]): string | undefined` — rows newest-first.
  - `loadAttempts` is **removed**. Task 6 and Task 7 delete its call sites.

`QuizItem.id` and `CheckRecord.verseKey` are both `${packageId}:${verseNo}`, so the map returned by `listRecentChecks` is already keyed the way the items are.

- [ ] **Step 1: Write the failing test**

In `tests/unit/quizScope.test.ts`, replace the whole `describe('loadAttempts', ...)` block with the two blocks below, and add `newestAttempt` to the file's import from `../../src/lib/quiz/scope`.

The `loadAttempts` cases about *which record wins* become `newestAttempt` cases — that is the decision they were really testing. The cases about reading the right package are covered by Task 3's `listRecentChecks` tests.

```ts
describe('newestAttempt', () => {
	// Rows arrive newest-first, as listRecentChecks returns them.
	const near = (typed: string) => ({ typed, accuracy: 0.95 });

	it('returns nothing when no attempt was ever kept', () => {
		expect(newestAttempt([])).toBeUndefined();
	});

	it('returns the stored attempt for a verse that has one', () => {
		expect(newestAttempt([near('거의 맞은 문장')])).toBe('거의 맞은 문장');
	});

	it('prefers the newer of two stored attempts', () => {
		expect(newestAttempt([near('새 문장'), near('옛 문장')])).toBe('새 문장');
	});

	it('is not erased by a later clean check', () => {
		expect(newestAttempt([{ typed: undefined, accuracy: 1 }, near('거의 맞은 문장')])).toBe(
			'거의 맞은 문장'
		);
	});

	it('is not displaced by a later clean check that kept its own sentence', () => {
		expect(newestAttempt([{ typed: '완벽한 문장', accuracy: 1 }, near('거의 맞은 문장')])).toBe(
			'거의 맞은 문장'
		);
	});

	it('does not offer a perfect attempt as a question', () => {
		expect(newestAttempt([{ typed: '완벽한 문장', accuracy: 1 }])).toBeUndefined();
	});

	it('does not offer a collapsed attempt as a question', () => {
		expect(newestAttempt([{ typed: '앞부분만', accuracy: 0.3 }])).toBeUndefined();
	});
});
```

Then add, inside the existing `describe('resolveTarget', ...)` block, tests for the two new returned maps. Use the same package-installation helpers the surrounding tests already use; write history rows with `db.checkHistory.add` in the shape Task 3's test helper uses.

```ts
	it('returns a signal for every verse, including one never checked', async () => {
		// (install a package with verses 1 and 2 using this file's existing helper)
		const { signals } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(signals.get('a_krv:1')).toEqual({ fails: 0, lastAskedAt: undefined });
		expect(signals.get('a_krv:2')).toEqual({ fails: 0, lastAskedAt: undefined });
	});

	it('counts a failed check into the verse\'s signal', async () => {
		// (install the package, then add one accuracy-0.5 record for verse 1)
		const { signals } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(signals.get('a_krv:1')?.fails).toBe(1);
	});

	it('returns the recorded near miss as an attempt', async () => {
		// (install the package, then add one accuracy-0.95 record with `typed`)
		const { attempts } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(attempts.get('a_krv:1')).toBe('거의 맞은 문장');
	});

	// The verses are fine; only the history read failed. Emptying the scope
	// would tell the reader they have nothing to quiz, which is false.
	it('keeps the scope intact when the history read fails', async () => {
		// (install the package, then:)
		const spy = vi
			.spyOn(checkHistory, 'listRecentChecks')
			.mockRejectedValueOnce(new Error('read failed'));
		const r = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(r.items).toHaveLength(2);
		expect(r.signals.size).toBe(0);
		expect(r.attempts.size).toBe(0);
		spy.mockRestore();
	});
```

For the spy to work, import the module namespace at the top of the test file and have `scope.ts` call it through that binding — i.e. `import * as checkHistory from '../../src/lib/db/checkHistory'` in the test, and a plain named import in `scope.ts`. If `vi.spyOn` on the namespace does not take under this project's Vite config, use `vi.mock('../../src/lib/db/checkHistory', ...)` with `importOriginal` and a `listRecentChecks` mock instead — the same idiom `quizPageAttempts.test.ts` uses for `scope`. Either is acceptable; the assertion is what matters.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/quizScope.test.ts`
Expected: FAIL — `newestAttempt` not exported, and `signals`/`attempts` missing from `resolveTarget`'s result.

- [ ] **Step 3: Write the implementation**

In `src/lib/quiz/scope.ts`:

1. Add imports:

```ts
import { listRecentChecks } from '$lib/db/checkHistory';
import { signalOf, type VerseSignal } from './priority';
import type { CheckRecord } from '$lib/db/local';
```

2. Change `resolveTarget`'s signature and its `return`. Everything from `const items: QuizItem[] = []` through the `ratings` loop stays exactly as it is; only the signature and the tail change:

```ts
export async function resolveTarget(target: Target): Promise<{
	items: QuizItem[];
	ratings: Map<string, ItemRating>;
	signals: Map<string, VerseSignal>;
	attempts: Map<string, string>;
}> {
```

and, replacing `return { items, ratings };`:

```ts
	// One scan serves both the ranking and 틀린 곳 찾기's questions. They used
	// to be two reads at two different times, each behind its own
	// stale-result guard, and the guard was where Phase B's critical defect
	// lived. Reading here also means the picker holds everything it needs as
	// plain props and does no I/O of its own.
	//
	// Caught rather than propagated: a failed verse read empties the scope
	// and the picker says so, but a failed history read must not — the verses
	// are fine and the reader can still quiz them, unranked.
	const history = await listRecentChecks([...packageIds]).catch(
		() => new Map<string, CheckRecord[]>()
	);

	const signals = new Map<string, VerseSignal>();
	const attempts = new Map<string, string>();
	for (const item of items) {
		// QuizItem.id and CheckRecord.verseKey are the same string by
		// construction — both are `${packageId}:${verseNo}`.
		const rows = history.get(item.id) ?? [];
		signals.set(item.id, signalOf(rows));
		const attempt = newestAttempt(rows);
		if (attempt !== undefined) attempts.set(item.id, attempt);
	}

	return { items, ratings, signals, attempts };
}
```

3. Replace the entire `loadAttempts` function — its doc comment included — with:

```ts
/**
 * The sentence behind this verse's most recent near-miss attempt, if it has
 * one. `rows` is newest-first, as listRecentChecks returns it.
 *
 * Not simply the newest record's `typed` — that may well be a later clean
 * check, whose sentence is no question at all. A verse whose near miss was
 * recorded weeks ago is still worth asking about; the point is to hand back
 * the sentence the reader actually wrote, whenever they wrote it.
 *
 * The near-miss rule runs here rather than in recordCheck, which keeps every
 * attempt. Two consumers want different subsets of the same field — the
 * history sheet shows the reader any attempt back, including the flawless
 * recital and the one they gave up on — and a row dropped at write time is
 * gone for both.
 */
export function newestAttempt(
	rows: Pick<CheckRecord, 'typed' | 'accuracy'>[]
): string | undefined {
	for (const r of rows) {
		if (r.typed === undefined) continue;
		if (!isRecallableAttempt(r.accuracy)) continue;
		return r.typed;
	}
	return undefined;
}
```

4. Remove the now-unused `db` import only if nothing else in the file uses it — the `ratings` loop still reads `db.verseRatings`, so it stays.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/unit/quizScope.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm check`
Expected: errors in `QuizScopePicker.svelte`, `quizPageAttempts.test.ts`, `QuizScopePicker.test.ts` and `+page.svelte`, all reporting that `loadAttempts` no longer exists. That is the expected state — Tasks 6 and 7 clear them. Do not fix them here, and do not re-add `loadAttempts` to silence them.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quiz/scope.ts tests/unit/quizScope.test.ts
git commit -m "refactor(quiz): one scan for the ranking and the questions"
```

Note in the commit body that `pnpm check` and `pnpm test` are red on the four call sites until Task 7, and that this is deliberate.

---

### Task 5: `buildQueue` ranks; `filterByTier` filters

**Files:**
- Modify: `src/lib/quiz/session.ts:38-57`
- Test: `tests/unit/session.test.ts` — the only file importing `buildQueue` today

**Interfaces:**
- Consumes: `priorityOf(signal, now)`, `SESSION_SIZE`, `type VerseSignal` (Task 1).
- Produces:
  - `filterByTier(items: QuizItem[], tiers: Set<Tier>, ratings: Map<string, ItemRating>): QuizItem[]`
  - `buildQueue(pool: QuizItem[], opts: { signals: Map<string, VerseSignal>; now: number; eligible?: Set<string> }): QuizItem[]`

- [ ] **Step 1: Split the existing tests, then write the failing new ones**

Find the current `buildQueue` tests and rename their subject to `filterByTier`, changing each call from `buildQueue(items, tiers, ratings)` to `filterByTier(items, tiers, ratings)`. Their assertions do not change — tier filtering behaves exactly as before, including `tiers.size === 0` yielding nothing.

Then add a new `describe('buildQueue', ...)` block. The file already imports `QuizItem`; add `SESSION_SIZE` and `type VerseSignal` from `../../src/lib/quiz/priority`, and `filterByTier` to the existing `session` import.

```ts
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const q = (id: string): QuizItem => ({
	id,
	packageId: 'a_krv',
	verseNo: Number(id.split(':')[1]),
	title: id,
	cite: id,
	w: `본문 ${id}`
});

/** Every verse unproven, so ordering falls to the id tie-break. */
const noSignals = new Map<string, VerseSignal>();

describe('buildQueue', () => {
	it('returns everything when the pool is under the cap', () => {
		const pool = [q('a_krv:1'), q('a_krv:2')];
		expect(buildQueue(pool, { signals: noSignals, now: NOW })).toHaveLength(2);
	});

	it('caps the session at SESSION_SIZE', () => {
		const pool = Array.from({ length: SESSION_SIZE + 5 }, (_, i) => q(`a_krv:${i + 1}`));
		expect(buildQueue(pool, { signals: noSignals, now: NOW })).toHaveLength(SESSION_SIZE);
	});

	it('puts the verse with recent failures first', () => {
		const pool = [q('a_krv:1'), q('a_krv:2')];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW }],
			['a_krv:2', { fails: 3, lastAskedAt: NOW }]
		]);
		expect(buildQueue(pool, { signals, now: NOW }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1'
		]);
	});

	it('brings a long-untouched verse back ahead of one asked today', () => {
		const pool = [q('a_krv:1'), q('a_krv:2')];
		const signals = new Map<string, VerseSignal>([
			['a_krv:1', { fails: 0, lastAskedAt: NOW }],
			['a_krv:2', { fails: 0, lastAskedAt: NOW - 20 * DAY }]
		]);
		expect(buildQueue(pool, { signals, now: NOW }).map((i) => i.id)).toEqual([
			'a_krv:2',
			'a_krv:1'
		]);
	});

	it('treats a verse with no signal as never asked about', () => {
		const pool = [q('a_krv:1'), q('a_krv:2')];
		const signals = new Map<string, VerseSignal>([['a_krv:1', { fails: 0, lastAskedAt: NOW }]]);
		expect(buildQueue(pool, { signals, now: NOW })[0]?.id).toBe('a_krv:2');
	});

	it('breaks ties by id, so a fresh scope starts at the beginning', () => {
		const pool = [q('a_krv:3'), q('a_krv:1'), q('a_krv:2')];
		expect(buildQueue(pool, { signals: noSignals, now: NOW }).map((i) => i.id)).toEqual([
			'a_krv:1',
			'a_krv:2',
			'a_krv:3'
		]);
	});

	// The whole reason eligibility is applied before the cap: the ten
	// highest-priority verses can easily be ten the reader has no recorded
	// attempt for, and a 틀린 곳 찾기 session built from them would open with
	// no rounds at all.
	it('fills the session from eligible verses rather than dropping them after the cap', () => {
		const pool = Array.from({ length: SESSION_SIZE + 3 }, (_, i) => q(`a_krv:${i + 1}`));
		const eligible = new Set([`a_krv:${SESSION_SIZE + 2}`, `a_krv:${SESSION_SIZE + 3}`]);
		expect(buildQueue(pool, { signals: noSignals, now: NOW, eligible }).map((i) => i.id)).toEqual(
			[...eligible]
		);
	});

	it('asks about everything when no eligibility is given', () => {
		const pool = [q('a_krv:1'), q('a_krv:2')];
		expect(buildQueue(pool, { signals: noSignals, now: NOW })).toHaveLength(2);
	});

	it('returns nothing when nothing is eligible', () => {
		const pool = [q('a_krv:1')];
		expect(buildQueue(pool, { signals: noSignals, now: NOW, eligible: new Set() })).toEqual([]);
	});

	it('does not reorder the pool it was given', () => {
		const pool = [q('a_krv:3'), q('a_krv:1')];
		buildQueue(pool, { signals: noSignals, now: NOW });
		expect(pool.map((i) => i.id)).toEqual(['a_krv:3', 'a_krv:1']);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/session.test.ts`
Expected: FAIL — `filterByTier` is not exported, and `buildQueue` rejects its second argument.

- [ ] **Step 3: Write the implementation**

In `src/lib/quiz/session.ts`, add the import:

```ts
import { SESSION_SIZE, priorityOf, type VerseSignal } from './priority';
```

and replace the whole `buildQueue` function (lines 38–57) with:

```ts
/**
 * The scope narrowed to the chosen 난이도 그룹, unranked and uncapped.
 *
 * The order is whatever the scope produced — for an 암송 DAY, the order its
 * ranges are written in. buildQueue replaces that order; this function does
 * not, because two callers want the unranked set: the picker counts it to
 * say how large the chosen scope is, and 틀린 곳 찾기 counts how much of it
 * it has a question for.
 */
export function filterByTier(
	items: QuizItem[],
	tiers: Set<Tier>,
	ratings: Map<string, ItemRating>
): QuizItem[] {
	if (tiers.size === 0) return [];
	return items.filter((i) => tiers.has(hardestLevel(ratings.get(i.id)) as Tier));
}

/** A verse nothing is known about — never asked, never failed. */
const UNPROVEN: VerseSignal = { fails: 0 };

/**
 * Today's session: the verses that most want asking, capped at SESSION_SIZE.
 *
 * `eligible`, when given, is applied before the sort rather than after the
 * slice. 틀린 곳 찾기 can only ask about verses it has a recorded attempt
 * for, and the highest-priority ten are quite likely to be ten the reader has
 * never quizzed — filtering afterwards would open a session with no rounds at
 * all.
 *
 * Ties break by id, which is what lets a fresh scope advance: every verse in
 * an untouched package scores the same, so the first session takes the first
 * ten — and having been asked, those ten drop to the bottom and the next
 * session takes the next ten. Being asked is itself the rotation, so no
 * shuffle or rotation hash is needed.
 */
export function buildQueue(
	pool: QuizItem[],
	opts: { signals: Map<string, VerseSignal>; now: number; eligible?: Set<string> }
): QuizItem[] {
	const { signals, now, eligible } = opts;
	return pool
		.filter((i) => eligible === undefined || eligible.has(i.id))
		.map((item) => ({ item, score: priorityOf(signals.get(item.id) ?? UNPROVEN, now) }))
		.sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
		.slice(0, SESSION_SIZE)
		.map((x) => x.item);
}
```

`.filter` and `.map` each build a new array, so the sort never touches `pool`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/unit/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz/session.ts tests/unit/session.test.ts
git commit -m "feat(quiz): a session is the ten verses that want asking"
```

`pnpm check` is still red on the picker and the route. Task 6 clears the picker.

---

### Task 6: The picker stops doing I/O

**Files:**
- Modify: `src/lib/components/quiz/QuizScopePicker.svelte`
- Test: `tests/unit/QuizScopePicker.test.ts`

**Interfaces:**
- Consumes: `filterByTier`, `buildQueue` (Task 5); `type VerseSignal` (Task 1).
- Produces: the component's `Props` gains three fields, which Task 7 supplies:

```ts
interface Props {
	targets: Target[];
	selected: Target | null;
	items: QuizItem[];
	ratings: Map<string, ItemRating>;
	signals: Map<string, VerseSignal>;
	attempts: Map<string, string>;
	/** Stamped when the 대상 resolved, so the count shown and the session
	 *  started are ranked against one instant. */
	now: number;
	onPick: (t: Target) => void;
	onStart: (queue: QuizItem[], game: Game) => void;
}
```

`onStart` keeps its signature: the picker hands over the queue it already built, and the route never re-ranks.

- [ ] **Step 1: Delete the three tests that lock behaviour this task removes**

These three in `tests/unit/QuizScopePicker.test.ts` exist only to pin the async `$effect` and its stale-result guard. Attempts arrive as a prop now, so there is no read to be in flight, no count to drop, and nothing to guard:

- `drops the count while a chip change is being re-read, rather than pairing it with a smaller total`
- `reads attempts for the tier-filtered queue, not the raw items`
- `does not disable 시작 while the attempt count is still loading`

Delete all three, and delete the file's `vi.mock` of `../../src/lib/quiz/scope` and its `loadAttempts` import — nothing mocks a read that no longer happens.

The third one's real requirement — that a reader is never blocked from starting by a count that has not arrived — is now structural: the count cannot arrive late.

- [ ] **Step 2: Write the failing tests**

Extend `setup()` in that file to pass the three new props:

```ts
function setup(over: Record<string, unknown> = {}) {
	const props = {
		targets,
		selected: targets[1],
		items: [item(1), item(2)],
		ratings: new Map<string, ItemRating>([
			['a_krv:1', { start: 2, full: 2 }],
			['a_krv:2', { start: 5, full: 5 }]
		]),
		signals: new Map<string, VerseSignal>(),
		attempts: new Map([['a_krv:1', '거의 맞은 문장']]),
		now: 1_700_000_000_000,
		onPick: vi.fn(),
		onStart: vi.fn(),
		...over
	};
	render(QuizScopePicker, props);
	return props;
}
```

Then add:

```ts
describe('QuizScopePicker — session size', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			id: `a_krv:${i + 1}`,
			packageId: 'a_krv',
			verseNo: i + 1,
			title: `제목 ${i + 1}`,
			cite: `창세기 1 : ${i + 1}`,
			w: `본문 ${i + 1}`
		}));

	it('says only the count when the whole scope fits in one session', () => {
		setup({ items: many(7), ratings: new Map(), attempts: new Map() });
		expect(screen.getByText('7구절')).toBeInTheDocument();
	});

	it('says how much of a larger scope today\'s session covers', () => {
		setup({ items: many(48), ratings: new Map(), attempts: new Map() });
		expect(screen.getByText('48구절 중 오늘 10구절')).toBeInTheDocument();
	});

	it('hands onStart only the capped session', async () => {
		const props = setup({ items: many(48), ratings: new Map(), attempts: new Map() });
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]).toHaveLength(10);
	});

	it('puts a verse with recent failures ahead of one passed today', async () => {
		const now = 1_700_000_000_000;
		const props = setup({
			items: many(2),
			ratings: new Map(),
			attempts: new Map(),
			now,
			signals: new Map<string, VerseSignal>([
				['a_krv:1', { fails: 0, lastAskedAt: now }],
				['a_krv:2', { fails: 3, lastAskedAt: now }]
			])
		});
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]?.[0]?.id).toBe('a_krv:2');
	});

	it('shows the attempt count without waiting for a read', () => {
		setup();
		fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		// No waitFor: attempts arrived with the scope.
		return waitFor(() =>
			expect(screen.getByText('2구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);
	});

	it('starts 틀린 곳 찾기 only on verses it has a question for', async () => {
		const props = setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(vi.mocked(props.onStart).mock.calls[0]?.[0]?.map((i: QuizItem) => i.id)).toEqual([
			'a_krv:1'
		]);
	});
});
```

The existing tests `says how many real questions 틀린 곳 찾기 has`, `disables 시작 when 틀린 곳 찾기 has nothing to ask, and says why`, `announces the attempts count` and `tells a disabled 시작 why it is disabled` stay — rewrite each to set `attempts` through props instead of through the deleted mock. Their assertions and expected strings do not change.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test tests/unit/QuizScopePicker.test.ts`
Expected: FAIL — the component still imports `loadAttempts`, which no longer exists.

- [ ] **Step 4: Write the implementation**

In `src/lib/components/quiz/QuizScopePicker.svelte`, replace the whole `<script>` block's imports, props and derived state:

```svelte
<script lang="ts">
	import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '$lib/db/verseRatings';
	import {
		buildQueue,
		filterByTier,
		type ItemRating,
		type QuizItem,
		type Tier
	} from '$lib/quiz/session';
	import type { Target } from '$lib/quiz/scope';
	import type { VerseSignal } from '$lib/quiz/priority';
	import { GAMES, GAME_LABELS, type Game } from '$lib/quiz/games';

	interface Props {
		targets: Target[];
		selected: Target | null;
		/** Everything the selected 대상 resolves to, before the tier filter. */
		items: QuizItem[];
		ratings: Map<string, ItemRating>;
		signals: Map<string, VerseSignal>;
		/** Per verse, the sentence 틀린 곳 찾기 can ask about. */
		attempts: Map<string, string>;
		/** Stamped when the 대상 resolved. Held still while the reader moves
		 *  chips, so the count they read and the session they start are ranked
		 *  against one instant rather than two. */
		now: number;
		onPick: (t: Target) => void;
		onStart: (queue: QuizItem[], game: Game) => void;
	}
	let { targets, selected, items, ratings, signals, attempts, now, onPick, onStart }: Props =
		$props();

	/** Every chip on to begin with: the reader opened this to quiz a scope,
	 *  not to narrow one. null is 미평가. */
	let tiers = $state<Set<Tier>>(new Set<Tier>([...DIFFICULTY_LEVELS, null]));

	/** One game for the whole session. 전체 타이핑 is the default because it
	 *  is the one that works on every verse from the first day. */
	let game = $state<Game>('typing');

	/** The chosen scope, unranked. The denominator of both counts below. */
	const pool = $derived(filterByTier(items, tiers, ratings));

	/** 틀린 곳 찾기 can only ask about a verse it has a recorded attempt for.
	 *  The other two games ask about anything. */
	const eligible = $derived(game === 'spot' ? new Set(attempts.keys()) : undefined);

	const queue = $derived(buildQueue(pool, { signals, now, eligible }));

	/** How many of the chosen scope have a sentence to ask about. */
	const attemptCount = $derived(pool.filter((i) => attempts.has(i.id)).length);

	/** The line explaining why 시작 cannot be pressed, or undefined when it
	 *  can. Tabbing onto a dead button should say what would revive it.
	 *
	 *  An empty pool and an empty queue are different failures: the first
	 *  means the chips exclude everything, the second — only reachable for
	 *  틀린 곳 찾기, whose eligibility is the only thing that can empty a
	 *  non-empty pool — means there is nothing recorded to ask about. */
	const describedBy = $derived(
		pool.length === 0 ? 'quiz-start-empty' : queue.length === 0 ? 'quiz-start-no-attempts' : undefined
	);

	function toggle(t: Tier) {
		const next = new Set(tiers);
		if (next.has(t)) next.delete(t);
		else next.add(t);
		tiers = next;
	}
</script>
```

The `$effect` and the `attemptCount` `$state` are both gone.

In the markup, three changes. The 게임 group's live region:

```svelte
		<div aria-live="polite">
			{#if game === 'spot'}
				<p class="mt-2 text-[12px] text-[var(--color-text-tertiary)]">
					{pool.length}구절 중 {attemptCount}개에 내 오답 기록이 있습니다
				</p>
			{/if}
		</div>
```

The count and the 시작 button:

```svelte
	<div class="flex items-center justify-between gap-3">
		<!-- Both numbers, because they are different promises: the first is the
		     scope the reader chose, the second is what this sitting will
		     actually ask about. Showing only the cap would look like the scope
		     shrank. -->
		<span class="text-[13px] text-[var(--color-text-secondary)]">
			{#if queue.length < pool.length}
				{pool.length}구절 중 오늘 {queue.length}구절
			{:else}
				{queue.length}구절
			{/if}
		</span>
		<button
			type="button"
			onclick={() => onStart(queue, game)}
			disabled={queue.length === 0}
			aria-describedby={describedBy}
			class="rounded-xl bg-[var(--color-accent)] px-5 py-2 font-medium text-white disabled:opacity-40"
		>
			시작
		</button>
	</div>
```

And the reasons region, whose branches now read from `pool` and `queue`:

```svelte
	<div aria-live="polite">
		{#if pool.length === 0}
			<p id="quiz-start-empty" class="text-[12px] text-[var(--color-text-tertiary)]">
				고른 범위에 구절이 없습니다
			</p>
		{:else if queue.length === 0}
			<p id="quiz-start-no-attempts" class="text-[12px] text-[var(--color-text-tertiary)]">
				아직 내 오답 기록이 없어 출제할 문제가 없습니다
			</p>
		{/if}
	</div>
```

Both `aria-live` wrappers stay always-rendered. A live region has to exist before its text changes or the change is never announced, and these lines still come and go as the chips move.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/unit/QuizScopePicker.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/quiz/QuizScopePicker.svelte tests/unit/QuizScopePicker.test.ts
git commit -m "refactor(quiz): the picker reads props and nothing else"
```

---

### Task 7: The route stamps the clock and stops racing

**Files:**
- Modify: `src/routes/quiz/+page.svelte`
- Test: `tests/unit/quizPageAttempts.test.ts`

**Interfaces:**
- Consumes: `resolveTarget` returning `{ items, ratings, signals, attempts }` (Task 4); the picker's `Props` (Task 6).
- Produces: nothing downstream. This is the last task.

- [ ] **Step 1: Delete the three tests that lock behaviour this task removes**

In `tests/unit/quizPageAttempts.test.ts`:

- `does not show a round until the attempts read settles` — attempts arrive with the scope, before 시작 is even enabled, so the window this guarded no longer exists.
- `discards a load that resolves after a later start already applied` — `runVersion` is deleted. **Replaced in Step 2** by a test for `pickVersion`, the guard that remains; do not simply drop a race test without replacing it.
- `tells the reader on the summary when the attempts read fails` — the `unsaved = picked.length` path is deleted with the read. The replacement behaviour, a failed history read leaving the scope intact and unranked, is Task 4's `keeps the scope intact when the history read fails`.

Also update the file's `vi.mock` — `resolveTarget` now returns four fields and `loadAttempts` is gone:

```ts
vi.mock('../../src/lib/quiz/scope', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/quiz/scope')>()),
	listTargets: vi.fn(async () => [target]),
	resolveTarget: resolveTargetMock
}));
```

with `const { resolveTargetMock } = vi.hoisted(() => ({ resolveTargetMock: vi.fn() }))` and a `beforeEach` default of

```ts
	resolveTargetMock.mockResolvedValue({
		items: [verse],
		ratings: new Map(),
		signals: new Map(),
		attempts: new Map()
	});
```

Every remaining test in the file — including the three `source recording` ones — keeps working against that default. The first test, `shows the recorded attempt once the read resolves, not the intact verse`, supplies its own `attempts` map through `resolveTargetMock` instead of through `loadAttemptsMock`; rename it to `shows the recorded attempt rather than the intact verse`, since there is no longer a later read to resolve.

- [ ] **Step 2: Write the failing tests**

```ts
describe('quiz/+page.svelte — session size and order', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => item('a_krv', i + 1, `본문 ${i + 1}`));

	it('asks about at most SESSION_SIZE verses from a larger scope', async () => {
		resolveTargetMock.mockResolvedValue({
			items: many(48),
			ratings: new Map(),
			signals: new Map(),
			attempts: new Map()
		});

		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		expect(screen.getByText('48구절 중 오늘 10구절')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));

		// The round header counts the session, not the scope. QuizTypingRound
		// renders `{index + 1} / {total}`.
		await waitFor(() => expect(screen.getByText('1 / 10')).toBeInTheDocument());
	});

	it('opens on the verse with the most recent failures', async () => {
		const now = Date.now();
		resolveTargetMock.mockResolvedValue({
			items: [item('a_krv', 1, '첫째 구절'), item('a_krv', 2, '둘째 구절')],
			ratings: new Map(),
			signals: new Map([
				['a_krv:1', { fails: 0, lastAskedAt: now }],
				['a_krv:2', { fails: 3, lastAskedAt: now }]
			]),
			attempts: new Map()
		});

		render(QuizPage);
		await waitFor(() => expect(screen.getByRole('button', { name: '시작' })).not.toBeDisabled());
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));

		await waitFor(() => expect(screen.getByText('제목 2')).toBeInTheDocument());
	});

	// pickVersion is the guard that survives this change: resolveTarget is
	// still async and a reader can still tap a second 대상 before the first
	// resolves. It has never had a test; deleting the runVersion one without
	// leaving a race covered is how the last two defects hid.
	it('discards a 대상 that resolves after a later pick already applied', async () => {
		let resolveFirst: ((r: unknown) => void) | undefined;
		resolveTargetMock.mockImplementationOnce(
			() => new Promise((resolve) => { resolveFirst = resolve; })
		);
		resolveTargetMock.mockResolvedValueOnce({
			items: [item('a_krv', 2, '둘째 구절')],
			ratings: new Map(),
			signals: new Map(),
			attempts: new Map()
		});

		render(QuizPage);
		await fireEvent.click(screen.getByRole('button', { name: 'A구절' }));
		await waitFor(() => expect(screen.getByText('1구절')).toBeInTheDocument());

		resolveFirst?.({
			items: many(48),
			ratings: new Map(),
			signals: new Map(),
			attempts: new Map()
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.getByText('1구절')).toBeInTheDocument();
		expect(screen.queryByText('48구절 중 오늘 10구절')).toBeNull();
	});
});
```

The third test assumes the first `pick` is the auto-pick at mount and the click is a second one. Read the route's `$effect` and `pick` before writing it, and adjust which call each `mockImplementationOnce` lands on if the auto-pick makes it off-by-one.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test tests/unit/quizPageAttempts.test.ts`
Expected: FAIL — the route still imports `loadAttempts`.

- [ ] **Step 4: Write the implementation**

In `src/routes/quiz/+page.svelte`:

1. The import loses `loadAttempts`:

```ts
	import { listTargets, resolveTarget, type Target } from '$lib/quiz/scope';
	import type { VerseSignal } from '$lib/quiz/priority';
```

2. Add state beside `items`/`ratings`:

```ts
	let signals = $state<Map<string, VerseSignal>>(new Map());

	/**
	 * Stamped when a 대상 resolves, not when 시작 is pressed.
	 *
	 * The picker ranks the queue to show its count and hands that same queue
	 * to start(). Reading the clock again here would rank twice against two
	 * instants and could hand back a different ten than the number the reader
	 * just read.
	 */
	let now = $state(Date.now());
```

3. Delete the entire `runVersion` declaration and its doc comment.

4. `pick` gains the two new maps and the stamp:

```ts
	function pick(t: Target) {
		selected = t;
		const version = ++pickVersion;
		resolveTarget(t)
			.then((r) => {
				if (version !== pickVersion) return;
				items = r.items;
				ratings = r.ratings;
				signals = r.signals;
				attempts = r.attempts;
				now = Date.now();
			})
			.catch(() => {
				if (version !== pickVersion) return;
				items = [];
				ratings = new Map();
				signals = new Map();
				attempts = new Map();
			});
	}
```

5. `start` loses its async branch entirely — attempts are already in hand, so every game starts the same way:

```ts
	function start(picked: QuizItem[], chosen: Game) {
		game = chosen;
		queue = picked;
		index = 0;
		results = [];
		unsaved = 0;
	}
```

Delete the comment block above the old `loadAttempts(picked)` call along with it; the hazard it described — a round mounting against the intact verse and having `shown` swapped underneath — is now impossible, because `attempts` is set before 시작 is ever enabled.

6. Pass the three new props to `<QuizScopePicker>`:

```svelte
	<QuizScopePicker {targets} {selected} {items} {ratings} {signals} {attempts} {now} onPick={pick} onStart={start} />
```

Keep whatever attribute order and formatting the file already uses.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/unit/quizPageAttempts.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and run the full suite**

Run: `pnpm check && pnpm test`
Expected: zero type errors; every file green. `pnpm check` has been red since Task 4 and this is where it clears — if anything still reports `loadAttempts`, a call site was missed.

- [ ] **Step 7: Commit**

```bash
git add src/routes/quiz/+page.svelte tests/unit/quizPageAttempts.test.ts
git commit -m "feat(quiz): today's ten, ranked once against one clock"
```

---

## Manual verification

After Task 7, run `pnpm dev` and walk `/quiz` in a real browser. The two defects that survived Phases A and B — a `$state` proxy reaching IndexedDB, and an identity comparison against a proxied array — both passed every test and both were found this way.

1. Pick a 대상 with more than ten verses. The count reads `N구절 중 오늘 10구절`, and 시작 opens a session of ten rounds.
2. Fail the same verse two or three times through 전체 타이핑. Return to the picker, pick the 대상 again, and start: that verse comes up first.
3. Pass every verse in a small 대상. Start again — the order should be stable and no round should be skipped or repeated.
4. Choose 틀린 곳 찾기. The `N구절 중 M개에 내 오답 기록이 있습니다` line appears **immediately**, without a visible delay, and 시작 is disabled with its reason when M is 0.
5. Open DevTools → Application → IndexedDB. Confirm the database is still `memscripture@80` — no version bump — and that new rows carry no new fields.
6. Console must be clean. A `DataCloneError` here would mean a `$state` proxy reached Dexie, which is the exact defect Phase A shipped.

## Self-review notes

- **Spec coverage.** Rule → Task 1. Assisted-before-slice in both places → Tasks 1 and 2. One scan → Tasks 3 and 4. Degrade-not-empty → Task 4. `buildQueue` split with eligibility before the cap → Task 5. Picker copy and the deleted `$effect` → Task 6. `now` stamped on pick, `runVersion` deleted, route tests → Task 7.
- **Deletions are deliberate.** Six existing tests are deleted across Tasks 6 and 7 because they pin machinery this plan removes. Each deletion names its reason, and the two that covered real hazards get replacements (Task 4's degradation test, Task 7's `pickVersion` race test). An implementer who finds one of these tests failing should confirm it is on the deletion list — and if it is not, the change is wrong, not the test.
- **`pnpm check` is red from Task 4 to Task 7.** That is stated in both tasks. Do not re-export `loadAttempts` to make it green early.
