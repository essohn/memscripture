# Miss History and Mark Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the per-word right/wrong answer every 점검 already computes, and use the last five checks of a verse to propose underlines in 밑줄 mode.

**Architecture:** One optional `missed?: number[]` field on the existing `CheckRecord`, one pure function that turns recent records into a set of word indices, and a dotted class in `VerseCard`. Nothing new is persisted and no new table exists, so there is no schema version, no sync merge rule, and no way for a suggestion to disagree with the history it came from.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes (`$state`, `$derived`), Dexie (IndexedDB), Vitest + @testing-library/svelte, `fake-indexeddb` for db-backed tests.

**Spec:** `docs/superpowers/specs/2026-08-26-miss-history-and-mark-suggestions-design.md`

## Global Constraints

- Branch is `feat/miss-history`, already cut from `main`. Do not merge or rebase `feat/listen-all` into it.
- Rule constants, exported from `src/lib/memorize/missStats.ts`, exact values: `SUGGEST_WINDOW = 5`, `SUGGEST_MIN_MISSES = 2`, `SUGGEST_MAX_PER_VERSE = 3`.
- **No Dexie version bump.** `missed` is not an index, so `stores()` in `src/lib/db/local.ts` stays at v8. Adding a `this.version(9)` block is a plan violation.
- **No sync change.** `src/lib/sync/merge.ts` and `snapshot.ts` are not touched; `unionById` already carries whole `checkHistory` records.
- **No new table and no new route.** Suggestions are derived on read, never stored.
- Absent `missed` and `missed: []` mean different things and must stay distinguishable everywhere: absent = the check predates this feature and measured nothing; `[]` = the check was clean.
- Korean UI copy, exact strings: `자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄` (suggestions present) and the existing `자주 틀리는 단어를 눌러 밑줄` (none). The separator is `·` (U+00B7) surrounded by single spaces.
- Test command is `pnpm test` (vitest, `tests/unit/**/*.test.ts`). A single file: `pnpm test <path>`. The suite on this branch stands at 1040 passing tests across 76 files and must stay green. (1103 was measured on feat/listen-all, a different branch — it does not apply here.)
- Repo commit style: lowercase `type(scope): subject`, subject is a sentence describing the behavior rather than the diff. Include the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/db/local.ts` | `CheckRecord.missed?: number[]`. | 1 |
| `src/lib/db/checkHistory.ts` | `recordCheck` accepts and stores `missed`. | 1 |
| `tests/unit/checkHistory.test.ts` | Round trip and the absent/empty distinction. | 1 |
| `src/lib/memorize/missStats.ts` *(new)* | The whole rule. Pure, no I/O, no Svelte. | 2 |
| `tests/unit/missStats.test.ts` *(new)* | Rule boundaries. | 2 |
| `src/lib/components/card/MemorizeCheckPanel.svelte` | Reports missed positions on both save paths. | 3 |
| `tests/unit/MemorizeCheckPanel.test.ts` | Both save paths report. | 3 |
| `src/lib/components/card/VerseCard.svelte` | Lazy history load for 밑줄, derivation, dotted class, hint line. | 4 |
| `tests/unit/VerseCard.suggest.test.ts` *(new)* | Marking-mode rendering. | 4 |

Task order is a dependency chain: 1 produces the field 2 types against, 3 writes and 4 reads; 2 produces the function 4 consumes. The field comes first so that no commit in the sequence leaves `pnpm check` failing.

---

### Task 1: Persist the missed positions

**Files:**
- Modify: `src/lib/db/local.ts` (the `CheckRecord` interface)
- Modify: `src/lib/db/checkHistory.ts` (`recordCheck`'s `entry` parameter type)
- Test: `tests/unit/checkHistory.test.ts` (extend)

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces: `CheckRecord.missed?: number[]`, and `recordCheck(packageId, verseNo, entry, checkedAt?)` whose `entry` now accepts `missed?: number[]`. Task 2 types against the field, Task 3 writes it, Task 4 reads it.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('checkHistory', ...)` block in `tests/unit/checkHistory.test.ts`:

```ts
	it('keeps the missed word positions', async () => {
		await recordCheck('900_krv', 1, entry({ accuracy: 0.9, missed: [2, 5] }), 1000);
		expect((await listChecks('900_krv', 1))[0].missed).toEqual([2, 5]);
	});

	// [] is evidence, not the absence of it — a clean check is what pushes an
	// older miss out of the suggestion window. Absent means the check predates
	// the feature and measured nothing at all, so the two must not collapse.
	it('distinguishes a clean check from one that measured nothing', async () => {
		await recordCheck('900_krv', 1, entry({ missed: [] }), 1000);
		await recordCheck('900_krv', 2, entry(), 1000);
		expect((await listChecks('900_krv', 1))[0].missed).toEqual([]);
		expect((await listChecks('900_krv', 2))[0].missed).toBeUndefined();
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: FAIL — both new tests, `expected undefined to deeply equal [ 2, 5 ]` and `expected undefined to deeply equal []`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/db/local.ts`, add the field to `CheckRecord`, directly below the existing `hints` field:

```ts
	/** Word positions the attempt got wrong, as markMismatchedWords saw them.
	 *  Optional for the same reason `hints` is: records written before this
	 *  existed have none, and absent is not the same as an empty array — one
	 *  means nothing was measured, the other means nothing was missed. */
	missed?: number[];
```

Do **not** add a `this.version(9)` block. `missed` is not an index; Dexie persists whole objects and `stores()` declares only indexes, so v8 stands and no migration exists.

In `src/lib/db/checkHistory.ts`, add the field to `recordCheck`'s `entry` parameter type:

```ts
	entry: {
		start: DifficultyLevel | null;
		full: DifficultyLevel | null;
		accuracy: number;
		elapsedMs: number;
		hints?: number;
		missed?: number[];
	},
```

The body already does `...entry`, so there is nothing else to change.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: PASS, all tests in the file.

Then typecheck:

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/local.ts src/lib/db/checkHistory.ts tests/unit/checkHistory.test.ts
git commit -F - <<'EOF'
feat(db): record where a check went wrong, not just how far

One optional field on the record that already exists. Not indexed, so
the Dexie schema stays at v8 with no migration, and checkHistory is
merged by unionById so the sync envelope carries it untouched.

Absent and empty stay different on purpose: absent is a check from
before this existed and measured nothing, empty is a check that missed
nothing — and only the second should push an old miss out of view.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The rule

Pure logic, no database and no component. Everything about "which words does this verse propose" lives here, so the thresholds can be tuned by reading one file.

**Files:**
- Create: `src/lib/memorize/missStats.ts`
- Test: `tests/unit/missStats.test.ts`

**Interfaces:**
- Consumes: `CheckRecord` from `$lib/db/local`, whose `missed?: number[]` field Task 1 added.
- Produces:
  - `SUGGEST_WINDOW: 5`, `SUGGEST_MIN_MISSES: 2`, `SUGGEST_MAX_PER_VERSE: 3`
  - `suggestedMarks(history: Pick<CheckRecord, 'missed'>[], wordCount: number): Set<number>` — `history` is most-recent-first, as `listChecks()` returns it. A full `CheckRecord[]` satisfies it, which is what `VerseCard` passes in Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/missStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	SUGGEST_MAX_PER_VERSE,
	SUGGEST_WINDOW,
	suggestedMarks
} from '../../src/lib/memorize/missStats';

/** Records newest-first, the order listChecks returns. */
const checks = (...missed: (number[] | undefined)[]) => missed.map((m) => ({ missed: m }));

describe('suggestedMarks', () => {
	it('proposes nothing without history', () => {
		expect(suggestedMarks([], 11)).toEqual(new Set());
	});

	// One slip is a typo or a bad morning, not a weak spot.
	it('needs two misses, not one', () => {
		expect(suggestedMarks(checks([3]), 11)).toEqual(new Set());
		expect(suggestedMarks(checks([3], [3]), 11)).toEqual(new Set([3]));
	});

	// The window is what makes a suggestion decay: get better at the verse and
	// the old misses fall out the back, with nothing having to expire them.
	it('ignores a miss older than the window', () => {
		const history = checks([1], [], [], [], [], [1]);
		expect(history).toHaveLength(SUGGEST_WINDOW + 1);
		expect(suggestedMarks(history, 11)).toEqual(new Set());
	});

	// Absent is not the same as clean. Records written before this feature
	// measured nothing; counting them as successes would let a long history
	// suppress the suggestions the new records earn.
	it('lets a pre-feature record fill the window without contributing', () => {
		expect(suggestedMarks(checks([2], undefined, [2]), 11)).toEqual(new Set([2]));
	});

	// One attempt cannot miss the same word twice — markMismatchedWords returns
	// one entry per position, so a repeat would be a caller bug.
	it('counts a repeated index inside one record once', () => {
		expect(suggestedMarks(checks([4, 4]), 11)).toEqual(new Set());
	});

	// An OYO verse can be edited shorter underneath its own history.
	it('drops an index past the end of the verse', () => {
		expect(suggestedMarks(checks([9], [9]), 5)).toEqual(new Set());
	});

	// markMismatchedWords stops matching where the attempt ran out, so a
	// half-typed verse reports its whole tail as missed. Twice, and an uncapped
	// rule would dot the rest of the verse instead of naming a spot.
	it('caps a give-up at the words where the attempt stalled', () => {
		const tail = [3, 4, 5, 6, 7, 8, 9];
		const out = suggestedMarks(checks(tail, tail), 11);
		expect(out.size).toBe(SUGGEST_MAX_PER_VERSE);
		expect(out).toEqual(new Set([3, 4, 5]));
	});

	// Miss count decides first; ties go to the word you reach first.
	it('ranks by miss count before position', () => {
		expect(suggestedMarks(checks([1, 2, 3, 8], [1, 2, 3, 8], [8]), 11)).toEqual(
			new Set([8, 1, 2])
		);
	});

	it('proposes nothing for a verse with no words', () => {
		expect(suggestedMarks(checks([0], [0]), 0)).toEqual(new Set());
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/missStats.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/memorize/missStats"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/memorize/missStats.ts`:

```ts
import type { CheckRecord } from '$lib/db/local';

/** How many recent checks are consulted. */
export const SUGGEST_WINDOW = 5;
/** How many misses inside that window earn a suggestion. */
export const SUGGEST_MIN_MISSES = 2;
/**
 * How many spots one verse may propose at once.
 *
 * markMismatchedWords walks the verse forward and stops matching where the
 * attempt ran out, so an attempt the reader gave up on and submitted
 * half-typed reports the entire tail of the verse as missed. Two of those and
 * an uncapped rule would dot twenty words — which is not a hint about a spot,
 * it is the verse highlighted.
 *
 * Deliberately narrower than what the reader can mark by hand: the suggestion
 * is a nudge toward a place, the marking is theirs.
 */
export const SUGGEST_MAX_PER_VERSE = 3;

/**
 * The words this reader keeps missing, as positions in the verse.
 *
 * Derived on every read rather than stored. A stored suggestion would need a
 * schema version, a merge rule, a decay policy and an answer for what happens
 * when an OYO verse is edited under it; computing it from the records that
 * already exist removes all four, and it cannot disagree with the history it
 * came from. The same reasoning listPerfectVerseNos states.
 *
 * `history` is most-recent-first, as listChecks() returns it.
 */
export function suggestedMarks(
	history: Pick<CheckRecord, 'missed'>[],
	wordCount: number
): Set<number> {
	if (wordCount <= 0) return new Set();

	const tally = new Map<number, number>();
	for (const record of history.slice(0, SUGGEST_WINDOW)) {
		// Absent is not an empty array: the check predates this feature and
		// measured nothing, so it fills the window silently rather than counting
		// as a clean run.
		if (!record.missed) continue;
		for (const i of new Set(record.missed)) {
			// An OYO verse can be edited shorter than the history that describes it.
			if (i < 0 || i >= wordCount) continue;
			tally.set(i, (tally.get(i) ?? 0) + 1);
		}
	}

	return new Set(
		[...tally]
			.filter(([, misses]) => misses >= SUGGEST_MIN_MISSES)
			// Most-missed first, ties toward the earlier word — so a verse proposes
			// the places you reach first, which for a give-up is exactly where the
			// attempt stalled.
			.sort((a, b) => b[1] - a[1] || a[0] - b[0])
			.slice(0, SUGGEST_MAX_PER_VERSE)
			.map(([i]) => i)
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/missStats.test.ts`
Expected: PASS, 9 tests.

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/missStats.ts tests/unit/missStats.test.ts
git commit -F - <<'EOF'
feat(memorize): the rule for what a verse keeps getting wrong

Two misses in the last five checks propose a word, capped at three per
verse. The cap is not tidiness: markMismatchedWords stops matching where
the attempt ran out, so a half-typed give-up reports the whole tail of
the verse. Ranking by miss count and keeping three turns that into the
words where the reader stalled instead of a highlighted verse.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Report the missed positions from the check panel

The panel already derives `mismatches` at `MemorizeCheckPanel.svelte:200` to paint the result. This stops throwing that answer away. There are **two** save paths and both must report: the flawless one that saves immediately (`submit()`, ~`:339`) and the one behind the confirmation dialog, which is also where 포기 lands (`save()`, ~`:368`).

**Files:**
- Modify: `src/lib/components/card/MemorizeCheckPanel.svelte`
- Test: `tests/unit/MemorizeCheckPanel.test.ts` (extend)

**Interfaces:**
- Consumes: `recordCheck`'s `missed?: number[]` from Task 2 (indirectly — the panel hands the outcome to `VerseCard`, which calls `recordCheck`).
- Produces: `onGraded`'s outcome object gains a required `missed: number[]`. `VerseCard.svelte:782` passes the outcome straight into `recordCheck`, so no change is needed there.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('MemorizeCheckPanel', ...)` block in `tests/unit/MemorizeCheckPanel.test.ts`:

```ts
	// The panel already works out which words went wrong in order to paint
	// them; this is that same answer, kept instead of discarded.
	it('reports the missed word positions', async () => {
		const { onGraded } = setup();
		await type(VERSE.replace('법도를', '법을'));
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ missed: [2] }));
	});

	// A flawless attempt skips the dialog, and its empty list is evidence: it
	// is what pushes an older miss out of the suggestion window.
	it('reports an empty list for a flawless attempt', async () => {
		const { onGraded } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ missed: [] }));
	});
```

`VERSE` is the file's existing constant, `그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고`. `법도를` is word index 2; replacing it with `법을` leaves every other word within `markMismatchedWords`'s drift allowance, so exactly one position comes back missed.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/MemorizeCheckPanel.test.ts`
Expected: FAIL — both new tests, `expected ... to match object { missed: [2] }` / `{ missed: [] }` against an outcome with no `missed` key.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/components/card/MemorizeCheckPanel.svelte`:

Extend the `onGraded` prop type (~`:42`):

```ts
		onGraded: (outcome: {
			start: DifficultyLevel | null;
			full: DifficultyLevel | null;
			accuracy: number;
			elapsedMs: number;
			hints: number;
			missed: number[];
		}) => void;
```

Add the helper next to `submit()`:

```ts
	/** Where this attempt went wrong, as positions in the verse. Read off the
	 *  same marking the panel already paints, so the stored history and the
	 *  screen can never disagree about one attempt. */
	function missedIndices(): number[] {
		return mismatches.flatMap((m, i) => (m.ok ? [] : [i]));
	}
```

In `submit()`, the flawless branch:

```ts
			onGraded({ ...result, accuracy, elapsedMs, hints: hintsUsed, missed: missedIndices() });
```

In `save()`:

```ts
			onGraded({
				...proposed,
				accuracy: accuracyOf(verse, typed),
				elapsedMs,
				hints: hintsUsed,
				missed: missedIndices()
			});
```

`mismatches` is a component-level `$derived` declared above both functions, and `typed` still holds the attempt when `save()` runs, so both call sites read the attempt they are reporting on.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/MemorizeCheckPanel.test.ts`
Expected: PASS, all tests in the file.

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/card/MemorizeCheckPanel.svelte tests/unit/MemorizeCheckPanel.test.ts
git commit -F - <<'EOF'
feat(check): keep the per-word answer the panel already paints

markMismatchedWords runs on every attempt to colour the result, and its
answer was thrown away the moment it was drawn. Both save paths now
carry it: the flawless one that skips the dialog, and the one behind
the confirmation that 포기 also lands on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Dotted suggestions in 밑줄 mode

The card already owns this verse's history (`VerseCard.svelte:283`) and already loads it lazily when 점검 opens, for the reason its comment gives: a 900-row list must not issue 900 queries for history nobody opened. Marking mode gets the same treatment, and the derivation lives here so both the package list and the verse detail route get suggestions with no route plumbing.

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`
- Create: `tests/unit/VerseCard.suggest.test.ts`

**Interfaces:**
- Consumes: `suggestedMarks` from Task 1, `CheckRecord.missed` from Task 2, records written by Task 3.
- Produces: no new props and no exported API. `VerseCard` renders a `suggested` class on curtain words.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/VerseCard.suggest.test.ts`. A new file rather than an addition to `VerseCard.memorize.test.ts`: this one needs `fake-indexeddb`, and importing it into the existing file would make its currently-rejecting `listChecks` calls start resolving, which is a change to tests this task is not about.

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import { db } from '../../src/lib/db/local';
import { recordCheck } from '../../src/lib/db/checkHistory';

// Word indices: 0 그들에게 · 1 율례와 · 2 법도를 · 3 가르쳐서 · 4 마땅히 · 5 갈
//               6 길과 · 7 할 · 8 일을 · 9 그들에게 · 10 보이고
const verse = {
	i: 127,
	no: 127,
	package_id: '900_krv',
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고'
};

const check = (missed: number[]) =>
	({ start: 3, full: 3, accuracy: 0.9, elapsedMs: 20_000, missed }) as never;

beforeEach(async () => {
	await db.delete();
	await db.open();
});

function setup(over: Record<string, unknown> = {}) {
	const { container } = render(VerseCard, {
		verse,
		packageName: '900구절',
		packageId: '900_krv',
		tags: [],
		marks: [],
		onToggleMark: vi.fn(),
		onPickStartDifficulty: vi.fn(),
		onPickFullDifficulty: vi.fn(),
		...over
	});
	return { container };
}

/** The curtain's words. Read mode renders bare spans with no `.word` class,
 *  so this only ever matches the rehearsal paragraph. */
const wordAt = (container: HTMLElement, i: number) => container.querySelectorAll('.word')[i];

async function openMarking() {
	await fireEvent.click(screen.getByRole('button', { name: '암송' }));
	await fireEvent.click(screen.getByRole('button', { name: '밑줄' }));
}

describe('밑줄: suggestions read off the check history', () => {
	// Two misses propose a word; one is a typo, not a weak spot. Asserting both
	// in one test means the negative cannot pass merely because the history
	// had not loaded yet.
	it('dots what was missed twice and leaves a single slip alone', async () => {
		await recordCheck('900_krv', 127, check([2, 5]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		const { container } = setup();
		await openMarking();
		await waitFor(() => expect(wordAt(container, 2)).toHaveClass('suggested'));
		expect(wordAt(container, 5)).not.toHaveClass('suggested');
	});

	// A suggestion that has been taken is not still a suggestion.
	it('stops dotting a word once it is really underlined', async () => {
		await recordCheck('900_krv', 127, check([2, 5]), 1000);
		await recordCheck('900_krv', 127, check([2, 5]), 2000);
		const { container } = setup({ marks: [{ i: 2, w: '법도를' }] });
		await openMarking();
		await waitFor(() => expect(wordAt(container, 5)).toHaveClass('suggested'));
		expect(wordAt(container, 2)).toHaveClass('underlined');
		expect(wordAt(container, 2)).not.toHaveClass('suggested');
	});

	// Outside marking mode a dot has nothing to tap: it would be a remark
	// competing with the reader's own underlines while they recite.
	it('shows nothing until 밑줄 is pressed', async () => {
		await recordCheck('900_krv', 127, check([2]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		const { container } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '암송' }));
		expect(container.querySelector('.suggested')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: '밑줄' }));
		await waitFor(() => expect(wordAt(container, 2)).toHaveClass('suggested'));
	});

	it('says so in the hint line when it has something to propose', async () => {
		await recordCheck('900_krv', 127, check([2]), 1000);
		await recordCheck('900_krv', 127, check([2]), 2000);
		setup();
		await openMarking();
		await waitFor(() =>
			expect(
				screen.getByText('자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄')
			).toBeInTheDocument()
		);
	});

	it('keeps the original hint line when it has nothing to propose', async () => {
		setup();
		await openMarking();
		expect(screen.getByText('자주 틀리는 단어를 눌러 밑줄')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/VerseCard.suggest.test.ts`
Expected: FAIL — the four suggestion tests time out in `waitFor` (`expected element to have class "suggested"`). The last test passes already, since that hint line is today's unconditional copy.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/components/card/VerseCard.svelte`:

**(a)** Add the import next to the existing `marks` import (~`:12`):

```ts
	import { suggestedMarks } from '$lib/memorize/missStats';
```

**(b)** Replace `toggleMarking()` (~`:274`):

```ts
	function toggleMarking() {
		marking = !marking;
		if (!marking) return;
		revealAll();
		loadCheckHistory();
	}
```

**(c)** Below `let checkHistory = $state<CheckRecord[]>([]);` (~`:283`), add the shared loader and the derivation:

```ts
	/** Loads this verse's checks. Lazy for the reason 점검 has always been: a
	 *  900-row list must not issue 900 queries for history nobody opened. Both
	 *  점검 and 밑줄 come through here and share the one piece of state, so a
	 *  reader who checks a verse and then opens 밑줄 sees the check they just
	 *  finished. */
	function loadCheckHistory() {
		if (!packageId) return;
		listChecks(packageId, verse.no)
			.then((rows) => (checkHistory = rows))
			.catch(() => {});
	}

	/** Words this reader keeps missing, proposed as underlines. Derived rather
	 *  than stored: a saved suggestion would outlive the history it came from
	 *  and point at a place already fixed. Empty outside marking mode, where a
	 *  dot would be a remark with nothing to tap. */
	const suggested = $derived(
		marking ? suggestedMarks(checkHistory, totalWords) : new Set<number>()
	);
```

**(d)** In `enterCheck()` (~`:316`), replace the inline query with the shared loader:

```ts
		mode = 'check';
		loadCheckHistory();
```

**(e)** In the rehearsal paragraph (~`:806`), add one class directive below `class:underlined`:

```svelte
				class:suggested={suggested.has(i) && !marked.has(i)}
```

**(f)** Replace the hint line (~`:821`):

```svelte
				{#if marking && suggested.size > 0}자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄{:else if marking}자주 틀리는 단어를 눌러 밑줄{:else if allRevealed}모두 열렸습니다{:else}← 좌→우로 드래그해서 단어 열기{/if}
```

**(g)** In the `<style>` block, directly after `.underlined` (~`:947`):

```css
	/* Proposed from the check history rather than placed by the reader — so it
	   is dotted and tertiary, plainly a suggestion beside the solid accent of a
	   real underline. Tapping it makes it real through the handler marking mode
	   already binds to every word. */
	.suggested {
		text-decoration: underline dotted;
		text-decoration-color: var(--color-text-tertiary);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/VerseCard.suggest.test.ts`
Expected: PASS, 5 tests.

Run: `pnpm test`
Expected: PASS — 1040 existing + 18 new (9 missStats, 2 checkHistory, 2 panel, 5 card) = 1058 tests, 0 failures.

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte tests/unit/VerseCard.suggest.test.ts
git commit -F - <<'EOF'
feat(card): propose the underlines the history already knows about

Marking mode has always asked the reader to remember which words they
keep missing — "자주 틀리는 단어를 눌러 밑줄" — which is the one faculty
under test. Pressing 밑줄 now loads this verse's checks the way 점검
already did, and dots the words missed twice in the last five.

Nothing is stored. Tapping a dot goes through the handler marking mode
already binds to every word, so a suggestion becomes a real underline
by the existing path and an ignored one is gone at the next clean check.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Manual verification

After Task 4, before finishing the branch:

1. `pnpm dev`, open a package list, pick a verse.
2. 점검 it twice, each time misspelling the **same** word. Save both.
3. 암송 → 밑줄. That word is dotted; the hint line reads `자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄`.
4. Tap the dotted word. It becomes a solid accent underline, and the dot is gone.
5. Reload the page and reopen 밑줄. The solid underline persists; the word is not dotted again.
6. 점검 the verse correctly three more times, then reopen 밑줄 on a *different* previously-dotted word — it is no longer proposed, having fallen out of the five-check window.

## Out of scope — do not build

Named because the spec rules them out, and each is a plausible thing to add unprompted:

- A statistics screen or route of any kind.
- Applying a suggestion automatically without a tap.
- A dismiss/reject action or any table remembering rejections.
- Showing suggestions in read mode, in the check panel, or in the curtain before 밑줄 is pressed.
- Any change to `srs/`, quiz scheduling, or verse priority — that is Phase 2, a separate spec.
