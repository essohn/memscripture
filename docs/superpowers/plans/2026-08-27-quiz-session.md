# Quiz Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quiz that takes the reader through a chosen scope one verse at a time, typing each from memory, recording every round beside the existing check history.

**Architecture:** Two pure modules (the queue rule, the Enter rule) and one I/O module (scope resolution) under `src/lib/quiz/`, three presentational components, and a thin route that holds the three states. Quiz rounds land in the existing `checkHistory` table marked by an optional `source` field, so no schema version and no sync change.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes (`$state`, `$derived`), Dexie (IndexedDB), Vitest + @testing-library/svelte, `fake-indexeddb` for db-backed tests.

**Spec:** `docs/superpowers/specs/2026-08-27-quiz-session-design.md`

## Global Constraints

- Work happens in the worktree at `.claude/worktrees/quiz-session` on branch `feat/quiz-session`. **Never `git checkout` in the main tree at `/Users/esohn/_dev/memscripture`** — concurrent sessions share it.
- **No Dexie version bump.** `source` is not an index, so `stores()` in `src/lib/db/local.ts` stays at v8. Adding a `this.version(9)` block is a plan violation.
- **No sync change.** `src/lib/sync/merge.ts` and `snapshot.ts` are not touched.
- `source` is optional and its absence means 점검. Nothing may default it to `'check'`, and no existing row is backfilled.
- A quiz round writes `start: null` and `full: null`. It never proposes a difficulty rating.
- Pass is `accuracyOf(verse, typed) >= 1` — the same definition the card's check already uses. No separate notion of "close enough".
- Everything in this feature is keyed by `${packageId}:${verseNo}`, never by verse number alone: one 암송 DAY can span packages, so two verses numbered 12 can be in the same session.
- Scope resolution reads verses with `listVerses()`, never `loadPackageData()` — the latter calls `installPackage()` on a miss.
- Test command is `pnpm test` (vitest, `tests/unit/**/*.test.ts`). A single file: `pnpm test <path>`. Typecheck: `pnpm check`.
- The suite in this worktree stands at **1060 passing tests across 78 files** and must stay green.
- Repo commit style: lowercase `type(scope): subject`, subject is a sentence describing the behavior rather than the diff, plus a `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.
- Korean UI copy is exact where this plan gives it. Do not paraphrase.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/db/local.ts` | `CheckRecord.source?: 'quiz'` | 1 |
| `src/lib/db/checkHistory.ts` | `recordCheck` accepts `source` | 1 |
| `src/lib/components/card/VerseCard.svelte` | 지난 점검 list filters quiz rounds out | 1 |
| `src/lib/memorize/typing.ts` *(new)* | `submitsOnEnter` — the IME-safe Enter rule | 2 |
| `src/lib/components/card/MemorizeCheckPanel.svelte` | calls `submitsOnEnter` instead of inlining it | 2 |
| `src/lib/quiz/session.ts` *(new)* | `Tier`, `QuizItem`, `RoundResult`, `buildQueue`, `summarize`. Pure. | 3 |
| `src/lib/quiz/scope.ts` *(new)* | `listTargets`, `resolveTarget`. The I/O half. | 4 |
| `src/lib/components/quiz/QuizTypingRound.svelte` *(new)* | cue, input, verdict | 5 |
| `src/lib/components/quiz/QuizScopePicker.svelte` *(new)* | 대상 list, 난이도 chips, count, 시작 | 6 |
| `src/lib/components/quiz/QuizSummary.svelte` *(new)* | passed/total and the failed verses | 6 |
| `src/routes/quiz/+page.svelte` *(new)* | the three states, wired | 7 |
| `src/routes/+page.svelte` | home entry card | 7 |

Dependency chain: 1 and 2 are independent groundwork; 3 is pure and depends on neither; 4 consumes 3's types; 5 consumes 2 and 3; 6 consumes 3 and 4; 7 consumes everything.

---

### Task 1: Mark a record with what produced it

**Files:**
- Modify: `src/lib/db/local.ts` (the `CheckRecord` interface)
- Modify: `src/lib/db/checkHistory.ts` (`recordCheck`'s `entry` parameter type)
- Modify: `src/lib/components/card/VerseCard.svelte` (the `history` prop passed to `MemorizeCheckPanel`)
- Test: `tests/unit/checkHistory.test.ts` (extend)

**Interfaces:**
- Consumes: nothing — first task.
- Produces: `CheckRecord.source?: 'quiz'`, and `recordCheck(packageId, verseNo, entry, checkedAt?)` whose `entry` accepts `source?: 'quiz'`. Task 7 writes it.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('checkHistory', ...)` block in `tests/unit/checkHistory.test.ts`:

```ts
	it('remembers that a round came from the quiz', async () => {
		await recordCheck('900_krv', 1, entry({ source: 'quiz' }), 1000);
		expect((await listChecks('900_krv', 1))[0].source).toBe('quiz');
	});

	// Absent is the app's primary act, not a missing value. Every record
	// written before this field existed was a 점검, so defaulting it would
	// have meant rewriting all of them to say what they already said.
	it('leaves a 점검 record with no source at all', async () => {
		await recordCheck('900_krv', 2, entry(), 1000);
		expect((await listChecks('900_krv', 2))[0].source).toBeUndefined();
	});

	// The underline suggestions treat a quiz round as evidence like any other:
	// it is a 점검 without the rating, so the words it got wrong count.
	it('counts a quiz round toward the underline suggestions', async () => {
		await recordCheck('900_krv', 3, entry({ accuracy: 0.9, missed: [2], source: 'quiz' }), 1000);
		await recordCheck('900_krv', 3, entry({ accuracy: 0.9, missed: [2], source: 'quiz' }), 2000);
		expect(suggestedMarks(await listChecks('900_krv', 3), 11)).toEqual(new Set([2]));
	});
```

Add the import at the top of the file, beside the existing ones:

```ts
import { suggestedMarks } from '../../src/lib/memorize/missStats';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: FAIL — the first test with `expected undefined to be 'quiz'`. The other two may already pass; that is fine and expected, because `recordCheck` spreads `...entry` and stores unknown keys at runtime. The type is what is missing, so also run `pnpm check` and expect an error on `.source` not existing on `CheckRecord`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/db/local.ts`, add to `CheckRecord`, directly below `missed`:

```ts
	/** What produced this record. Absent means 점검 — every record written
	 *  before this field existed was one, and it is the app's primary act, so
	 *  the default already says the true thing about old rows. */
	source?: 'quiz';
```

Do **not** add a `this.version(9)` block. `source` is not an index.

In `src/lib/db/checkHistory.ts`, add the field to `recordCheck`'s `entry` parameter type, below `missed`:

```ts
		source?: 'quiz';
```

The body already spreads `...entry`, so nothing else changes there.

**`listPerfectVerseNos` needs no change and must not get one.** It already
reads every row for the package and lets the most recent decide, so a quiz
pass lights the badge on its own — which is right: the badge says "this verse
is solid right now", and a full typed pass is that evidence.

In `src/lib/components/card/VerseCard.svelte`, the `MemorizeCheckPanel` is passed `history={checkHistory}`. Change it to:

```svelte
				history={checkHistory.filter((r) => !r.source)}
```

and put this comment directly above that line:

```svelte
				<!-- 점검 only. One `checkHistory` state feeds two consumers that want
				     different things: this list counts 점검 and its label says so,
				     while the underline suggestions count quiz rounds too — same act
				     without the rating. Filtering here rather than at the query keeps
				     it to one read. -->
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: PASS, all tests in the file.

Run: `pnpm test tests/unit/VerseCard.suggest.test.ts tests/unit/VerseCard.memorize.test.ts`
Expected: PASS — the filter must not disturb the existing card tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/local.ts src/lib/db/checkHistory.ts src/lib/components/card/VerseCard.svelte tests/unit/checkHistory.test.ts
git commit -F - <<'EOF'
feat(db): tell a quiz round apart from a 점검

One optional field. Absent means 점검, which is what every existing row
already is, so nothing is backfilled and the Dexie schema stays at v8.

The card keeps one history state for two consumers that disagree: its
지난 점검 list counts 점검 and says so on the label, while the underline
suggestions count quiz rounds too — a quiz round is a 점검 without the
rating, and the words it got wrong are the same evidence.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Extract the IME-safe Enter rule

A second typing surface is about to exist. Korean input commits a syllable with Enter, so an Enter arriving mid-composition is not a submit — duplicating that rule guarantees a day when only one of the two is fixed.

**Files:**
- Create: `src/lib/memorize/typing.ts`
- Modify: `src/lib/components/card/MemorizeCheckPanel.svelte` (`onKeydown`, around line 322)
- Test: `tests/unit/typing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `submitsOnEnter(e: { key: string; shiftKey: boolean; isComposing: boolean }): boolean`. Task 5 uses it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/typing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { submitsOnEnter } from '../../src/lib/memorize/typing';

const ev = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => ({
	key: 'Enter',
	shiftKey: false,
	isComposing: false,
	...over
});

describe('submitsOnEnter', () => {
	it('submits on a plain Enter', () => {
		expect(submitsOnEnter(ev())).toBe(true);
	});

	// Korean input uses Enter to commit a syllable. Submitting on that
	// keystroke fires while the reader is still mid-word.
	it('does not submit while a syllable is being composed', () => {
		expect(submitsOnEnter(ev({ isComposing: true }))).toBe(false);
	});

	it('does not submit on Shift+Enter, which is a newline', () => {
		expect(submitsOnEnter(ev({ shiftKey: true }))).toBe(false);
	});

	it('ignores every other key', () => {
		expect(submitsOnEnter(ev({ key: 'a' }))).toBe(false);
		expect(submitsOnEnter(ev({ key: 'Tab' }))).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/typing.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/memorize/typing"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/memorize/typing.ts`:

```ts
/**
 * Whether this keystroke means "submit".
 *
 * Enter submits. Shift+Enter keeps the newline, and a composing Enter is
 * ignored: Korean input uses Enter to commit a syllable, so submitting on that
 * keystroke would fire while the reader was mid-word.
 *
 * Extracted from the check panel because the quiz's typing round needs the
 * same rule, and a copy of it is a copy that gets fixed once.
 */
export function submitsOnEnter(e: {
	key: string;
	shiftKey: boolean;
	isComposing: boolean;
}): boolean {
	return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}
```

In `src/lib/components/card/MemorizeCheckPanel.svelte`, add the import beside the other `$lib/memorize` imports:

```ts
	import { submitsOnEnter } from '$lib/memorize/typing';
```

Replace `onKeydown`'s body, keeping the function and its doc comment's first line but deferring the rule:

```ts
	/** Enter submits, unless it is committing a Korean syllable or carrying a
	 *  Shift — see submitsOnEnter, which the quiz's round shares. */
	function onKeydown(e: KeyboardEvent) {
		if (!submitsOnEnter(e)) return;
		e.preventDefault();
		if (typed.trim().length > 0) submit();
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/typing.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm test tests/unit/MemorizeCheckPanel.test.ts`
Expected: PASS, all of them. This is a refactor — a single failure here means the behavior moved, not just the code.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/typing.ts src/lib/components/card/MemorizeCheckPanel.svelte tests/unit/typing.test.ts
git commit -F - <<'EOF'
refactor(memorize): give the Enter rule one home

Korean input commits a syllable with Enter, so a composing Enter is not
a submit. The quiz's typing round needs the same rule, and the version
that stays inline in one component is the version that gets fixed while
the other keeps the bug.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The queue rule

Pure. No database, no Svelte. Everything about "which verses does this scope serve, in what order" lives here, and Phase C replaces the ordering without touching anything else.

**Files:**
- Create: `src/lib/quiz/session.ts`
- Test: `tests/unit/session.test.ts`

**Interfaces:**
- Consumes: `DifficultyLevel` from `$lib/db/verseRatings`; `hardestLevel` from `$lib/verses/difficultySort`.
- Produces:
  - `type Tier = DifficultyLevel | null`
  - `interface QuizItem { id: string; packageId: string; verseNo: number; title: string; cite: string; w: string }`
  - `interface RoundResult { id: string; passed: boolean; accuracy: number; missed: number[]; elapsedMs: number }`
  - `type ItemRating = { start: DifficultyLevel | null; full: DifficultyLevel | null }`
  - `buildQueue(items: QuizItem[], tiers: Set<Tier>, ratings: Map<string, ItemRating>): QuizItem[]`
  - `summarize(results: RoundResult[]): { passed: number; total: number; failed: string[] }`

Tasks 4, 5, 6 and 7 all import from here.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildQueue, summarize, type QuizItem, type Tier } from '../../src/lib/quiz/session';
import type { DifficultyLevel } from '../../src/lib/db/verseRatings';

const item = (packageId: string, verseNo: number): QuizItem => ({
	id: `${packageId}:${verseNo}`,
	packageId,
	verseNo,
	title: `제목 ${verseNo}`,
	cite: `창세기 1 : ${verseNo}`,
	w: `본문 ${verseNo}`
});

const rating = (start: DifficultyLevel | null, full: DifficultyLevel | null) => ({ start, full });
const ALL: Set<Tier> = new Set([1, 2, 3, 4, 5, null]);

describe('buildQueue', () => {
	it('serves nothing from an empty scope', () => {
		expect(buildQueue([], ALL, new Map())).toEqual([]);
	});

	// No chip selected is a scope of nothing, not a scope of everything —
	// "all" and "none" must not be the same gesture.
	it('serves nothing when no tier is selected', () => {
		const items = [item('a', 1)];
		expect(buildQueue(items, new Set(), new Map([['a:1', rating(3, 3)]]))).toEqual([]);
	});

	it('keeps a verse in a selected tier and drops one outside it', () => {
		const items = [item('a', 1), item('a', 2)];
		const ratings = new Map([
			['a:1', rating(2, 2)],
			['a:2', rating(5, 5)]
		]);
		expect(buildQueue(items, new Set<Tier>([2]), ratings).map((i) => i.id)).toEqual(['a:1']);
	});

	// hardestLevel takes the harder of the two ratings: they answer different
	// questions, and a comfortable start must not hide a body nobody finishes.
	it('files a verse by its harder rating, not its easier one', () => {
		const items = [item('a', 1)];
		const ratings = new Map([['a:1', rating(2, 5)]]);
		expect(buildQueue(items, new Set<Tier>([2]), ratings)).toHaveLength(1);
		expect(buildQueue(items, new Set<Tier>([5]), ratings)).toHaveLength(0);
	});

	// An unrated verse is usually the one that has had the least attention,
	// so it gets a chip of its own rather than being silently dropped.
	it('files an unrated verse under 미평가', () => {
		const items = [item('a', 1)];
		expect(buildQueue(items, new Set<Tier>([null]), new Map())).toHaveLength(1);
		expect(buildQueue(items, new Set<Tier>([1, 2, 3, 4, 5]), new Map())).toHaveLength(0);
	});

	// One 암송 DAY can span packages, so verse 1 of two packages can meet in
	// one session. Keying by verse number alone would let one decide the
	// other's fate.
	it('keeps two packages\' verse 1 apart', () => {
		const items = [item('a', 1), item('b', 1)];
		const ratings = new Map([
			['a:1', rating(1, 1)],
			['b:1', rating(5, 5)]
		]);
		expect(buildQueue(items, new Set<Tier>([1]), ratings).map((i) => i.id)).toEqual(['a:1']);
	});

	// The items arrive in the order the scope produced them — for an 암송 DAY,
	// the order its ranges are written in, which is how the reader knows the
	// day. Sorting by verse number would scramble a two-package day.
	it('does not reorder what it was given', () => {
		const items = [item('b', 9), item('a', 2), item('a', 1)];
		expect(buildQueue(items, ALL, new Map()).map((i) => i.id)).toEqual(['b:9', 'a:2', 'a:1']);
	});
});

describe('summarize', () => {
	const result = (id: string, passed: boolean) => ({
		id,
		passed,
		accuracy: passed ? 1 : 0.8,
		missed: passed ? [] : [2],
		elapsedMs: 1000
	});

	it('reports nothing for a session with no rounds', () => {
		expect(summarize([])).toEqual({ passed: 0, total: 0, failed: [] });
	});

	it('counts passes and names only what failed', () => {
		expect(summarize([result('a:1', true), result('a:2', false), result('b:1', false)])).toEqual({
			passed: 1,
			total: 3,
			failed: ['a:2', 'b:1']
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/session.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/quiz/session"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/quiz/session.ts`:

```ts
import type { DifficultyLevel } from '$lib/db/verseRatings';
import { hardestLevel } from '$lib/verses/difficultySort';

/** A difficulty chip. 1–5 is a rated tier; null is 미평가. */
export type Tier = DifficultyLevel | null;

/** One verse as the quiz asks it. */
export interface QuizItem {
	/** `${packageId}:${verseNo}` — the composite key every table here uses,
	 *  because one 암송 DAY can span packages and verse numbers repeat. */
	id: string;
	packageId: string;
	verseNo: number;
	title: string;
	cite: string;
	/** The verse body, which is what the reader has to produce. */
	w: string;
}

/** What one round produced. */
export interface RoundResult {
	/** QuizItem.id, never a bare verse number. */
	id: string;
	passed: boolean;
	accuracy: number;
	missed: number[];
	elapsedMs: number;
}

/** The rating shape hardestLevel takes — the display-side one from
 *  verses/difficultySort, not the VerseRating row in db/local. */
export type ItemRating = { start: DifficultyLevel | null; full: DifficultyLevel | null };

/**
 * The verses a scope actually serves, in the order they will be asked.
 *
 * Phase A filters and nothing more. The order is whatever the scope produced —
 * for an 암송 DAY, the order its ranges are written in, which is the order the
 * reader knows the day by; imposing verse-number order would scramble a day
 * whose ranges span two packages.
 *
 * This function is the seam Phase C replaces: priority scheduling changes the
 * order here rather than spreading through the session, the picker and the
 * route.
 */
export function buildQueue(
	items: QuizItem[],
	tiers: Set<Tier>,
	ratings: Map<string, ItemRating>
): QuizItem[] {
	if (tiers.size === 0) return [];
	return items.filter((i) => tiers.has(hardestLevel(ratings.get(i.id)) as Tier));
}

/** What the end screen reports. */
export function summarize(results: RoundResult[]): {
	passed: number;
	total: number;
	failed: string[];
} {
	return {
		passed: results.filter((r) => r.passed).length,
		total: results.length,
		failed: results.filter((r) => !r.passed).map((r) => r.id)
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/session.test.ts`
Expected: PASS, 10 tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz/session.ts tests/unit/session.test.ts
git commit -F - <<'EOF'
feat(quiz): the rule for which verses a scope serves

Filter by difficulty tier, keep the order the scope gave. Everything is
keyed by packageId:verseNo because one 암송 DAY can span packages, and
two verses numbered 12 in one session must not decide each other's fate.

buildQueue is deliberately the only place an ordering decision lives —
Phase C's priority scheduling replaces this function rather than
arriving spread across the session, the picker and the route.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Resolving a scope

The I/O half, kept out of `session.ts` so the rule stays testable without a database.

**Files:**
- Create: `src/lib/quiz/scope.ts`
- Test: `tests/unit/quizScope.test.ts`

**Interfaces:**
- Consumes: `QuizItem`, `ItemRating` from `$lib/quiz/session` (Task 3); `buildEventCards` from `$lib/db/events`; `listPackages`, `listVerses`, `isPackageInstalled` from `$lib/db/verses`; `db` from `$lib/db/local`.
- Produces:
  - `type Target = { kind: 'event'; id: string; label: string; ranges: { packageId: string; verseNos: number[] }[] } | { kind: 'package'; id: string; label: string }`
  - `listTargets(today: string): Promise<Target[]>`
  - `resolveTarget(target: Target): Promise<{ items: QuizItem[]; ratings: Map<string, ItemRating> }>`

Tasks 6 and 7 use both.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/quizScope.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { resolveTarget, type Target } from '../../src/lib/quiz/scope';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await db.packages.bulkPut([
		{ id: 'a_krv', name: 'A구절' },
		{ id: 'b_krv', name: 'B구절' }
	] as never);
	await db.verses.bulkPut([
		{ package_id: 'a_krv', no: 1, i: 1, title: 'A1', cite: '창세기 1 : 1', w: 'a one' },
		{ package_id: 'a_krv', no: 2, i: 2, title: 'A2', cite: '창세기 1 : 2', w: 'a two' },
		{ package_id: 'b_krv', no: 1, i: 1, title: 'B1', cite: '출애굽기 1 : 1', w: 'b one' }
	] as never);
	await db.verseRatings.bulkPut([
		{ id: 'a_krv:1', packageId: 'a_krv', verseNo: 1, startDifficulty: 2, fullDifficulty: 4, updatedAt: 1 },
		{ id: 'b_krv:1', packageId: 'b_krv', verseNo: 1, startDifficulty: 5, fullDifficulty: 5, updatedAt: 1 }
	] as never);
});

const event = (ranges: { packageId: string; verseNos: number[] }[]): Target => ({
	kind: 'event',
	id: 'e1',
	label: '11월 암송 데이',
	ranges
});

describe('resolveTarget', () => {
	// One 암송 DAY can name ranges in two packages. Both belong to the session,
	// in the order the ranges are written.
	it('gathers an event that spans two packages, in range order', async () => {
		const { items } = await resolveTarget(
			event([
				{ packageId: 'b_krv', verseNos: [1] },
				{ packageId: 'a_krv', verseNos: [2, 1] }
			])
		);
		expect(items.map((i) => i.id)).toEqual(['b_krv:1', 'a_krv:2', 'a_krv:1']);
		expect(items[0]).toMatchObject({ title: 'B1', cite: '출애굽기 1 : 1', w: 'b one' });
	});

	// buildEventCards already skips ranges whose package is not installed;
	// a quiz scope that threw on one would be stricter than the home screen.
	it('skips a range whose package is not installed', async () => {
		const { items } = await resolveTarget(
			event([
				{ packageId: 'missing_krv', verseNos: [1] },
				{ packageId: 'a_krv', verseNos: [1] }
			])
		);
		expect(items.map((i) => i.id)).toEqual(['a_krv:1']);
	});

	// Two packages' verse 1 are different verses. Keyed by number alone, one
	// would take the other's difficulty.
	it('keys ratings by package and verse together', async () => {
		const { ratings } = await resolveTarget(
			event([
				{ packageId: 'a_krv', verseNos: [1] },
				{ packageId: 'b_krv', verseNos: [1] }
			])
		);
		expect(ratings.get('a_krv:1')).toEqual({ start: 2, full: 4 });
		expect(ratings.get('b_krv:1')).toEqual({ start: 5, full: 5 });
	});

	it('serves a whole package in verse order', async () => {
		const { items } = await resolveTarget({ kind: 'package', id: 'a_krv', label: 'A구절' });
		expect(items.map((i) => i.id)).toEqual(['a_krv:1', 'a_krv:2']);
	});

	// loadPackageData installs on a miss. Listing quiz scopes must not have
	// that side effect — the home screen was already fixed for this once.
	it('does not install a package that is missing', async () => {
		await resolveTarget(event([{ packageId: 'missing_krv', verseNos: [1] }]));
		expect(await db.packages.get('missing_krv')).toBeUndefined();
		expect(await db.verses.where('package_id').equals('missing_krv').count()).toBe(0);
	});

	it('returns an empty scope rather than throwing when nothing resolves', async () => {
		const { items, ratings } = await resolveTarget(event([]));
		expect(items).toEqual([]);
		expect(ratings.size).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/quizScope.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/quiz/scope"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/quiz/scope.ts`:

```ts
import { db } from '$lib/db/local';
import { buildEventCards } from '$lib/db/events';
import { isPackageInstalled, listPackages, listVerses } from '$lib/db/verses';
import type { ItemRating, QuizItem } from './session';
import type { DifficultyLevel } from '$lib/db/verseRatings';

/** Something the reader can quiz themselves on. */
export type Target =
	| {
			kind: 'event';
			id: string;
			label: string;
			ranges: { packageId: string; verseNos: number[] }[];
	  }
	| { kind: 'package'; id: string; label: string };

/** The 대상 the picker offers: active 암송 DAYs first, then installed packages. */
export async function listTargets(today: string): Promise<Target[]> {
	const cards = await buildEventCards(today).catch(() => []);
	const events: Target[] = cards.map((c) => ({
		kind: 'event',
		id: c.eventId,
		label: c.eventTitle,
		ranges: c.ranges.map((r) => ({ packageId: r.packageId, verseNos: r.verseNos }))
	}));
	const packages = await listPackages().catch(() => []);
	return [...events, ...packages.map((p) => ({ kind: 'package' as const, id: p.id, label: p.name }))];
}

function toItem(v: { package_id: string; no: number; title: string; cite: string; w: string }): QuizItem {
	return {
		id: `${v.package_id}:${v.no}`,
		packageId: v.package_id,
		verseNo: v.no,
		title: v.title,
		cite: v.cite,
		w: v.w
	};
}

/**
 * A 대상's verses and their ratings, both keyed by `${packageId}:${verseNo}`.
 *
 * Reads verses with listVerses rather than loadPackageData: the latter calls
 * installPackage on a miss, and installing a package as a side effect of
 * listing quiz scopes is the fault the home screen was already fixed for. A
 * range whose package is absent is skipped, the way buildEventCards skips it.
 */
export async function resolveTarget(
	target: Target
): Promise<{ items: QuizItem[]; ratings: Map<string, ItemRating> }> {
	const items: QuizItem[] = [];
	const packageIds = new Set<string>();

	if (target.kind === 'package') {
		if (await isPackageInstalled(target.id)) {
			packageIds.add(target.id);
			for (const v of await listVerses(target.id)) items.push(toItem(v));
		}
	} else {
		for (const range of target.ranges) {
			if (!(await isPackageInstalled(range.packageId))) continue;
			packageIds.add(range.packageId);
			const verses = await listVerses(range.packageId);
			const byNo = new Map(verses.map((v) => [v.no, v]));
			// The range's own order, not the package's — an 암송 DAY is known by
			// the order it was written in.
			for (const no of range.verseNos) {
				const v = byNo.get(no);
				if (v) items.push(toItem(v));
			}
		}
	}

	const ratings = new Map<string, ItemRating>();
	for (const packageId of packageIds) {
		const rows = await db.verseRatings.where('packageId').equals(packageId).toArray();
		for (const r of rows) {
			ratings.set(`${r.packageId}:${r.verseNo}`, {
				start: (r.startDifficulty ?? null) as DifficultyLevel | null,
				full: (r.fullDifficulty ?? null) as DifficultyLevel | null
			});
		}
	}

	return { items, ratings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/quizScope.test.ts`
Expected: PASS, 6 tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz/scope.ts tests/unit/quizScope.test.ts
git commit -F - <<'EOF'
feat(quiz): turn a 대상 into the verses it actually names

An 암송 DAY resolves through its ranges, in the order they are written,
across however many packages they name. Verses come from listVerses,
not loadPackageData, because that one installs a package on a miss and
listing quiz scopes must not quietly install anything.

Ratings come back keyed by packageId:verseNo for the same reason the
items are: two packages' verse 1 are different verses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The typing round

**Files:**
- Create: `src/lib/components/quiz/QuizTypingRound.svelte`
- Test: `tests/unit/QuizTypingRound.test.ts`

**Interfaces:**
- Consumes: `submitsOnEnter` from `$lib/memorize/typing` (Task 2); `QuizItem`, `RoundResult` from `$lib/quiz/session` (Task 3); `accuracyOf`, `markMismatchedWords` from `$lib/memorize/grade`.
- Produces: a component with props `{ item: QuizItem; index: number; total: number; onDone: (result: RoundResult) => void }`. Task 7 renders it.

Grading is shared with the card's check — `accuracyOf` and `markMismatchedWords` — but the component is not. `MemorizeCheckPanel` is 780 lines carrying rating pickers, hints, dictation, 포기 and per-verse history; a round needs a cue, an input and a verdict.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/QuizTypingRound.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizTypingRound from '../../src/lib/components/quiz/QuizTypingRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

// Word indices: 0 그들에게 · 1 율례와 · 2 법도를 · 3 가르쳐서 · 4 마땅히 · 5 갈
//               6 길과 · 7 할 · 8 일을 · 9 그들에게 · 10 보이고
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';

const item: QuizItem = {
	id: '900_krv:127',
	packageId: '900_krv',
	verseNo: 127,
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: VERSE
};

function setup() {
	const onDone = vi.fn();
	render(QuizTypingRound, { item, index: 0, total: 3, onDone });
	return { onDone };
}

async function type(text: string) {
	await fireEvent.input(screen.getByRole('textbox'), { target: { value: text } });
}

describe('QuizTypingRound', () => {
	// The cue is the title and the citation. Showing the body would be showing
	// the answer.
	it('shows the cue and hides the verse', () => {
		setup();
		expect(screen.getByText('출애굽기 18 : 20')).toBeInTheDocument();
		expect(screen.queryByText(VERSE)).toBeNull();
	});

	it('passes an exact attempt', async () => {
		const { onDone } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, missed: [] })
		);
	});

	// Spacing is a spelling problem, not a recall failure — the card's check
	// already grades it that way and the quiz must not disagree.
	it('passes an attempt that differs only in spacing', async () => {
		const { onDone } = setup();
		await type(VERSE.replace(/ /g, ''));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('fails a one-word slip and reports where it was', async () => {
		const { onDone } = setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ passed: false, missed: [2] })
		);
	});

	it('marks the word that went wrong before moving on', async () => {
		setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		const wrong = document.querySelector('.wrong');
		expect(wrong?.textContent?.trim()).toBe('법도를');
	});

	it('will not submit an empty attempt', async () => {
		setup();
		expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
	});

	it('says which round this is', () => {
		setup();
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/QuizTypingRound.test.ts`
Expected: FAIL — cannot resolve `QuizTypingRound.svelte`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/components/quiz/QuizTypingRound.svelte`:

```svelte
<script lang="ts">
	import { accuracyOf, markMismatchedWords } from '$lib/memorize/grade';
	import { submitsOnEnter } from '$lib/memorize/typing';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';

	interface Props {
		item: QuizItem;
		/** 0-based; shown to the reader 1-based. */
		index: number;
		total: number;
		/** Fired once, when the reader leaves this round. */
		onDone: (result: RoundResult) => void;
	}
	let { item, index, total, onDone }: Props = $props();

	let typed = $state('');
	/** The verdict, or null while the reader is still answering. */
	let verdict = $state<RoundResult | null>(null);

	/** Measured from when the round appears, not from the first keystroke —
	 *  the pause before starting to type is part of recalling the verse, and
	 *  the card's check measures it the same way. */
	const startedAt = Date.now();

	const marks = $derived(verdict ? markMismatchedWords(item.w, typed) : []);

	function submit() {
		if (typed.trim().length === 0 || verdict) return;
		const accuracy = accuracyOf(item.w, typed);
		verdict = {
			id: item.id,
			passed: accuracy >= 1,
			accuracy,
			missed: markMismatchedWords(item.w, typed).flatMap((m, i) => (m.ok ? [] : [i])),
			elapsedMs: Date.now() - startedAt
		};
	}

	function onKeydown(e: KeyboardEvent) {
		if (!submitsOnEnter(e)) return;
		e.preventDefault();
		submit();
	}

	function next() {
		if (verdict) onDone(verdict);
	}
</script>

<div class="rounded-2xl bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
	<div class="flex items-baseline justify-between">
		<h2 class="text-[calc(16px*var(--vfs))] font-semibold text-[var(--color-text)]">
			{item.title}
		</h2>
		<span class="text-[11px] text-[var(--color-text-tertiary)]">{index + 1} / {total}</span>
	</div>
	<p class="mt-0.5 text-[calc(14px*var(--vfs))] text-[var(--color-text-secondary)]">{item.cite}</p>

	{#if verdict === null}
		<textarea
			bind:value={typed}
			onkeydown={onKeydown}
			aria-label="암송 구절 입력"
			rows="4"
			class="mt-3 w-full resize-none rounded-xl bg-[var(--color-elevated)] p-3 text-[calc(16px*var(--vfs))] leading-[1.8] text-[var(--color-text)]"
		></textarea>
		<button
			type="button"
			onclick={submit}
			disabled={typed.trim().length === 0}
			class="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white disabled:opacity-40"
		>
			제출
		</button>
	{:else}
		<p class="mt-3 text-[calc(16px*var(--vfs))] leading-[1.9] break-keep">
			{#each marks as m, i (i)}<span class:wrong={!m.ok}>{m.word}</span>{' '}{/each}
		</p>
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{verdict.passed ? '통과' : '다시 볼 구절'}
		</p>
		<button
			type="button"
			onclick={next}
			class="mt-2 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			다음
		</button>
	{/if}
</div>

<style>
	/* The words the attempt missed. Red rather than the accent: this is the
	   result of a test, not a note the reader left themselves. */
	.wrong {
		color: var(--color-danger);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/QuizTypingRound.test.ts`
Expected: PASS, 7 tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/quiz/QuizTypingRound.svelte tests/unit/QuizTypingRound.test.ts
git commit -F - <<'EOF'
feat(quiz): one round — cue, type it, see what went wrong

Shares the grading with the card's check and nothing else. accuracyOf
and markMismatchedWords decide pass and marking, so the quiz cannot
disagree with 점검 about the same attempt, but the panel itself stays
where it is: 780 lines of rating pickers, hints, dictation and history
is not what a round needs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: The picker and the summary

**Files:**
- Create: `src/lib/components/quiz/QuizScopePicker.svelte`
- Create: `src/lib/components/quiz/QuizSummary.svelte`
- Test: `tests/unit/QuizScopePicker.test.ts`
- Test: `tests/unit/QuizSummary.test.ts`

**Interfaces:**
- Consumes: `Tier`, `QuizItem`, `buildQueue` from `$lib/quiz/session` (Task 3); `Target` from `$lib/quiz/scope` (Task 4); `DIFFICULTY_LABELS` from `$lib/db/verseRatings`.
- Produces:
  - `QuizScopePicker` props `{ targets: Target[]; selected: Target | null; items: QuizItem[]; ratings: Map<string, ItemRating>; onPick: (t: Target) => void; onStart: (queue: QuizItem[]) => void }`
  - `QuizSummary` props `{ passed: number; total: number; failed: QuizItem[]; onAgain: () => void; onClose: () => void }`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/QuizScopePicker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizScopePicker from '../../src/lib/components/quiz/QuizScopePicker.svelte';
import type { Target } from '../../src/lib/quiz/scope';
import type { ItemRating, QuizItem } from '../../src/lib/quiz/session';

const targets: Target[] = [
	{ kind: 'event', id: 'e1', label: '11월 암송 데이', ranges: [] },
	{ kind: 'package', id: 'a_krv', label: 'A구절' }
];

const item = (no: number): QuizItem => ({
	id: `a_krv:${no}`,
	packageId: 'a_krv',
	verseNo: no,
	title: `제목 ${no}`,
	cite: `창세기 1 : ${no}`,
	w: `본문 ${no}`
});

function setup(over: Record<string, unknown> = {}) {
	const props = {
		targets,
		selected: targets[1],
		items: [item(1), item(2)],
		ratings: new Map<string, ItemRating>([
			['a_krv:1', { start: 2, full: 2 }],
			['a_krv:2', { start: 5, full: 5 }]
		]),
		onPick: vi.fn(),
		onStart: vi.fn(),
		...over
	};
	render(QuizScopePicker, props);
	return props;
}

describe('QuizScopePicker', () => {
	it('offers every 대상 it was given', () => {
		setup();
		expect(screen.getByRole('button', { name: '11월 암송 데이' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'A구절' })).toBeInTheDocument();
	});

	// The count is the whole guard against starting a 900-verse session: the
	// reader sees the number before pressing 시작.
	it('shows how many verses the current scope resolves to', () => {
		setup();
		expect(screen.getByText('2구절')).toBeInTheDocument();
	});

	it('moves the count when a difficulty chip is turned off', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		expect(screen.getByText('1구절')).toBeInTheDocument();
	});

	// Nothing selected is a scope of nothing, and starting it would open a
	// session with no rounds in it.
	it('disables 시작 when the scope is empty, and says why', async () => {
		setup({ items: [] });
		expect(screen.getByRole('button', { name: '시작' })).toBeDisabled();
		expect(screen.getByText('고른 범위에 구절이 없습니다')).toBeInTheDocument();
	});

	it('hands the filtered queue to onStart', async () => {
		const { onStart } = setup();
		await fireEvent.click(screen.getByRole('button', { name: 'xEasy' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(onStart).toHaveBeenCalledTimes(1);
		expect(onStart.mock.calls[0][0].map((i: QuizItem) => i.id)).toEqual(['a_krv:1']);
	});

	it('reports a 대상 the reader picked', async () => {
		const { onPick } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '11월 암송 데이' }));
		expect(onPick).toHaveBeenCalledWith(targets[0]);
	});
});
```

Create `tests/unit/QuizSummary.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizSummary from '../../src/lib/components/quiz/QuizSummary.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

const failed: QuizItem[] = [
	{ id: 'a_krv:2', packageId: 'a_krv', verseNo: 2, title: '제목 2', cite: '창세기 1 : 2', w: '본문 2' }
];

describe('QuizSummary', () => {
	it('reports the score', () => {
		render(QuizSummary, { passed: 2, total: 3, failed, onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.getByText('2 / 3')).toBeInTheDocument();
	});

	it('names the verses to come back to', () => {
		render(QuizSummary, { passed: 2, total: 3, failed, onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.getByText('창세기 1 : 2')).toBeInTheDocument();
	});

	// A clean run has nothing to come back to, and an empty list under a
	// heading reads as a bug.
	it('says nothing about failures when there were none', () => {
		render(QuizSummary, { passed: 3, total: 3, failed: [], onAgain: vi.fn(), onClose: vi.fn() });
		expect(screen.queryByText('다시 볼 구절')).toBeNull();
	});

	it('offers another run', async () => {
		const onAgain = vi.fn();
		render(QuizSummary, { passed: 3, total: 3, failed: [], onAgain, onClose: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
		expect(onAgain).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/QuizScopePicker.test.ts tests/unit/QuizSummary.test.ts`
Expected: FAIL — neither component resolves.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/components/quiz/QuizScopePicker.svelte`:

```svelte
<script lang="ts">
	import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '$lib/db/verseRatings';
	import { buildQueue, type ItemRating, type QuizItem, type Tier } from '$lib/quiz/session';
	import type { Target } from '$lib/quiz/scope';

	interface Props {
		targets: Target[];
		selected: Target | null;
		/** Everything the selected 대상 resolves to, before the tier filter. */
		items: QuizItem[];
		ratings: Map<string, ItemRating>;
		onPick: (t: Target) => void;
		onStart: (queue: QuizItem[]) => void;
	}
	let { targets, selected, items, ratings, onPick, onStart }: Props = $props();

	/** Every chip on to begin with: the reader opened this to quiz a scope,
	 *  not to narrow one. null is 미평가. */
	let tiers = $state<Set<Tier>>(new Set<Tier>([...DIFFICULTY_LEVELS, null]));

	const queue = $derived(buildQueue(items, tiers, ratings));

	function toggle(t: Tier) {
		const next = new Set(tiers);
		if (next.has(t)) next.delete(t);
		else next.add(t);
		tiers = next;
	}
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">범위</h2>
		<div class="mt-2 flex flex-col gap-1.5">
			{#each targets as t (t.kind + t.id)}
				<button
					type="button"
					onclick={() => onPick(t)}
					aria-pressed={selected?.kind === t.kind && selected?.id === t.id}
					class="rounded-xl px-3 py-2 text-left text-[14px] {selected?.kind === t.kind &&
					selected?.id === t.id
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text)]'}"
				>
					{t.label}
				</button>
			{/each}
		</div>
	</div>

	<div>
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">난이도</h2>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each DIFFICULTY_LEVELS as level (level)}
				<button
					type="button"
					onclick={() => toggle(level)}
					aria-pressed={tiers.has(level)}
					class="rounded-full px-2.5 py-1 text-[12px] {tiers.has(level)
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
				>
					{DIFFICULTY_LABELS[level]}
				</button>
			{/each}
			<button
				type="button"
				onclick={() => toggle(null)}
				aria-pressed={tiers.has(null)}
				class="rounded-full px-2.5 py-1 text-[12px] {tiers.has(null)
					? 'bg-[var(--color-accent)] text-white'
					: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
			>
				미평가
			</button>
		</div>
	</div>

	<div class="flex items-center justify-between gap-3">
		<!-- The count is the whole guard against an unreasonable session: a
		     900-verse package is not a quiz, and a reader who sees the number
		     will narrow it. Capping would silently drop verses they chose. -->
		<span class="text-[13px] text-[var(--color-text-secondary)]">{queue.length}구절</span>
		<button
			type="button"
			onclick={() => onStart(queue)}
			disabled={queue.length === 0}
			class="rounded-xl bg-[var(--color-accent)] px-5 py-2 font-medium text-white disabled:opacity-40"
		>
			시작
		</button>
	</div>
	{#if queue.length === 0}
		<p class="text-[12px] text-[var(--color-text-tertiary)]">고른 범위에 구절이 없습니다</p>
	{/if}
</section>
```

Create `src/lib/components/quiz/QuizSummary.svelte`:

```svelte
<script lang="ts">
	import type { QuizItem } from '$lib/quiz/session';

	interface Props {
		passed: number;
		total: number;
		failed: QuizItem[];
		onAgain: () => void;
		onClose: () => void;
	}
	let { passed, total, failed, onAgain, onClose }: Props = $props();
</script>

<section class="space-y-4 text-center">
	<p class="text-[32px] font-semibold text-[var(--color-text)]">{passed} / {total}</p>

	{#if failed.length > 0}
		<div class="text-left">
			<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">다시 볼 구절</h2>
			<ul class="mt-2 space-y-1">
				{#each failed as f (f.id)}
					<li class="text-[13px] text-[var(--color-text)]">
						{f.title}
						<span class="text-[var(--color-text-tertiary)]">{f.cite}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex gap-2">
		<button
			type="button"
			onclick={onAgain}
			class="flex-1 rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다시 하기
		</button>
		<button
			type="button"
			onclick={onClose}
			class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			끝내기
		</button>
	</div>
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/QuizScopePicker.test.ts tests/unit/QuizSummary.test.ts`
Expected: PASS, 10 tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/quiz/QuizScopePicker.svelte src/lib/components/quiz/QuizSummary.svelte tests/unit/QuizScopePicker.test.ts tests/unit/QuizSummary.test.ts
git commit -F - <<'EOF'
feat(quiz): pick a scope, and see how the run went

Difficulty is a filter on a chosen 대상, not a 대상 of its own — "the
hard ones of what?" has no answer otherwise. Every chip starts on,
because the reader came to quiz a scope rather than narrow one.

The resolved verse count sits next to 시작 and is the only guard
against a 900-verse session. A cap would silently drop verses from a
range the reader chose, which is worse than showing them the number.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Wire the route and the way in

The last task. No new unit tests: this repo renders no `+page.svelte` under vitest, and everything worth asserting already lives in the components and the two pure modules. It is verified by the manual walk below.

**Files:**
- Create: `src/routes/quiz/+page.svelte`
- Modify: `src/routes/+page.svelte` (an entry card)
- Modify: none of `src/lib/components/home/EventSection.svelte` — see the note

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5, 6.
- Produces: nothing further.

- [ ] **Step 1: Write the route**

Create `src/routes/quiz/+page.svelte`:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import QuizScopePicker from '$lib/components/quiz/QuizScopePicker.svelte';
	import QuizTypingRound from '$lib/components/quiz/QuizTypingRound.svelte';
	import QuizSummary from '$lib/components/quiz/QuizSummary.svelte';
	import { listTargets, resolveTarget, type Target } from '$lib/quiz/scope';
	import { summarize, type ItemRating, type QuizItem, type RoundResult } from '$lib/quiz/session';
	import { recordCheck } from '$lib/db/checkHistory';
	import { todayLocalKey } from '$lib/db/activity';

	let targets = $state<Target[]>([]);
	let selected = $state<Target | null>(null);
	let items = $state<QuizItem[]>([]);
	let ratings = $state<Map<string, ItemRating>>(new Map());

	let queue = $state<QuizItem[] | null>(null);
	let index = $state(0);
	let results = $state<RoundResult[]>([]);

	const done = $derived(queue !== null && index >= queue.length);
	const summary = $derived(summarize(results));
	const failedItems = $derived(
		queue === null ? [] : queue.filter((i) => summary.failed.includes(i.id))
	);

	/**
	 * A pick that resolves after a later one must not win.
	 *
	 * Same shape as the guard in fontScale: the read is async and the reader
	 * can tap another 대상 while it is in flight, and without this the earlier
	 * read landing second would replace their choice with the one they left.
	 */
	let pickVersion = 0;

	$effect(() => {
		listTargets(todayLocalKey())
			.then((t) => {
				targets = t;
				if (selected === null && t.length > 0) pick(t[0]);
			})
			.catch(() => {});
	});

	function pick(t: Target) {
		selected = t;
		const version = ++pickVersion;
		resolveTarget(t)
			.then((r) => {
				if (version !== pickVersion) return;
				items = r.items;
				ratings = r.ratings;
			})
			.catch(() => {
				if (version !== pickVersion) return;
				items = [];
				ratings = new Map();
			});
	}

	function start(picked: QuizItem[]) {
		queue = picked;
		index = 0;
		results = [];
	}

	function finishRound(result: RoundResult) {
		results = [...results, result];
		const item = queue?.[index];
		if (item) {
			// The reader is mid-quiz. A storage failure costs one record's worth
			// of future evidence; stopping them to report it costs the session.
			recordCheck(item.packageId, item.verseNo, {
				start: null,
				full: null,
				accuracy: result.accuracy,
				elapsedMs: result.elapsedMs,
				missed: result.missed,
				source: 'quiz'
			}).catch(() => {});
		}
		index += 1;
	}

	function again() {
		if (queue) start(queue);
	}

	function close() {
		queue = null;
		index = 0;
		results = [];
	}
</script>

<Header title="퀴즈" showVerseToggle={false} />

<main class="mx-auto w-full max-w-2xl px-4 py-4">
	{#if queue === null}
		<QuizScopePicker {targets} {selected} {items} {ratings} onPick={pick} onStart={start} />
	{:else if done}
		<QuizSummary
			passed={summary.passed}
			total={summary.total}
			failed={failedItems}
			onAgain={again}
			onClose={close}
		/>
	{:else}
		{#key queue[index].id}
			<QuizTypingRound
				item={queue[index]}
				{index}
				total={queue.length}
				onDone={finishRound}
			/>
		{/key}
	{/if}
</main>
```

The `{#key}` is load-bearing: without it Svelte reuses the component across rounds and the next verse inherits the previous round's typed text and verdict.

`Header` takes `title: string` and defaults `showVerseToggle`, `showSearch`,
`showFontScale` and `showSettings` to true. `showVerseToggle={false}` because
that control toggles a verse card's body, and this screen has no verse card —
a control that does nothing is worse than no control. The font-scale picker
stays: the round renders verse text at `var(--vfs)`.

- [ ] **Step 2: Add the way in**

In `src/routes/+page.svelte`, add an entry card. Put it after the event section and before the recent bundles, following the card styling already in that file.

```svelte
	<a
		href="/quiz"
		class="flex items-center justify-between rounded-2xl bg-[var(--color-card)] px-4 py-3 shadow-[var(--shadow-card)]"
	>
		<span class="text-[15px] font-medium text-[var(--color-text)]">퀴즈</span>
		<span class="text-[12px] text-[var(--color-text-tertiary)]">범위를 골라 한 바퀴</span>
	</a>
```

**Do not put this on the event card.** `src/lib/components/home/EventSection.svelte` is being changed on the unmerged `feat/listen-all` branch; an entry there buys a conflict for nothing, since the picker preselects the first 대상 anyway.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test`
Expected: PASS — 1060 existing + 40 new = **1100** across 84 files, 0 failures.
The 40: 3 checkHistory, 4 typing, 10 session, 6 quizScope, 7 round, 6 picker,
4 summary.

Run: `pnpm check`
Expected: 0 errors.

If the totals disagree with this arithmetic, report the real numbers rather than adjusting the expectation.

- [ ] **Step 4: Walk it in a browser**

```bash
pnpm dev
```

1. Home shows the 퀴즈 card; it opens `/quiz`.
2. The picker lists the active 암송 DAY and the installed packages, and the verse count changes as difficulty chips are toggled.
3. Start a scope of two or three verses. Type one exactly → 통과. Type one with a single word wrong → that word is red and underlined, and 다음 advances.
4. The summary reports the right counts and names the failed verse.
5. In DevTools, `checkHistory` holds one new row per round, each with `source: 'quiz'`, `start: null`, `full: null`, and a `missed` array.
6. The verse card's 지난 점검 list does **not** show those rounds, while the same verse's 밑줄 mode dots a word missed twice across them.

Step 6 is the one that proves the two consumers really diverge — the rest passes even with the filter on the wrong side.

Delete any rows you seeded when you are done.

- [ ] **Step 5: Commit**

```bash
git add src/routes/quiz/+page.svelte src/routes/+page.svelte
git commit -F - <<'EOF'
feat(quiz): a route that takes you through a scope

Three states on one route, because the session lives in memory and a
route change would mean persisting it. The pick guard is the one from
fontScale: the resolve is async, and a read that lands after a later
tap must not replace the 대상 the reader actually chose.

Rounds are recorded as they finish, and a storage failure does not stop
the session — mid-quiz, that trades their run for information they
cannot act on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Out of scope — do not build

Named because the spec rules them out and each is a plausible unprompted addition:

- The first-words game or the spot-the-error game — Phase B.
- Any priority, weighting, or repetition in the queue — Phase C replaces `buildQueue`, and nothing before then may anticipate it.
- Persisting or resuming a session across a reload.
- Scores, streaks, or a quiz statistics screen.
- Difficulty ratings from a quiz round — `start` and `full` stay `null`.
- A cap on how many verses a scope may serve.
- Any change to `src/lib/sync/`, or a Dexie `version(9)`.
