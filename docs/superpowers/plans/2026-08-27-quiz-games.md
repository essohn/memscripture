# Quiz Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two more quiz games — get the verse started, and find the mistake in your own recorded attempt — plus a way to choose between the three.

**Architecture:** One pure module naming the games and the storage threshold; one optional `typed` field carrying the reader's attempt forward; two new round components; and a third axis on the scope picker. `source` widens to three values so each game's record says what it actually proves.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes (`$state`, `$derived`), Dexie (IndexedDB), Vitest + @testing-library/svelte, `fake-indexeddb` for db-backed tests.

**Spec:** `docs/superpowers/specs/2026-08-27-quiz-games-design.md`

## Global Constraints

- Work happens in the worktree at `.claude/worktrees/quiz-games` on branch `feat/quiz-games`. **Never `git checkout` in the main tree at `/Users/esohn/_dev/memscripture`** — concurrent sessions share it. Do not push.
- **No Dexie version bump.** `typed` is not an index, so `stores()` in `src/lib/db/local.ts` stays at v8. A `this.version(9)` block is a plan violation.
- **No sync change.** `src/lib/sync/merge.ts` and `snapshot.ts` are not touched.
- `source` is `'quiz' | 'quiz-opening' | 'quiz-spot'`, still optional, and **absent still means 점검**. Nothing may default it.
- `typed` is kept only when `accuracy >= RECALLABLE_MIN_ACCURACY` (0.9) **and** `accuracy < 1`. The decision lives in `recordCheck`, never at a call site.
- Nothing about which words are wrong is ever stored. `markMismatchedWords(shown, verse)` is recomputed at round time.
- **No synthesised errors.** The spot round shows the reader's own recorded attempt, or the correct verse. No 조사 swaps, no substitutions.
- The opening round's pass rule is `hasTypedOpening()` from `src/lib/memorize/timing.ts`, used exactly as it stands. Do not introduce a second notion of "has started this verse", and do not change `OPENING_WORDS`.
- Every round grades automatically or on 제출, but **leaves only on 다음**, and reports exactly once — guarded against a double tap, as `QuizTypingRound` already is.
- Korean UI copy is exact where this plan gives it. Do not paraphrase.
- Everything is keyed by `${packageId}:${verseNo}` (`QuizItem.id`), never by verse number alone.
- Test command is `pnpm test` (vitest, `tests/unit/**/*.test.ts`). Typecheck: `pnpm check`.
- The suite in this worktree stands at **1303 passing tests** and must stay green.
- Repo commit style: lowercase `type(scope): subject`, subject is a sentence describing the behavior rather than the diff, plus a `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/quiz/games.ts` *(new)* | `Game`, labels, `GAME_SOURCE`, `RECALLABLE_MIN_ACCURACY`, `isRecallableAttempt`. Pure. | 1 |
| `src/lib/db/local.ts` | `CheckRecord.typed`, `source` widened | 2 |
| `src/lib/db/checkHistory.ts` | store `typed` conditionally, `countsAsRecall`, narrow `listPerfectVerseNos` | 2 |
| `src/lib/components/card/VerseCard.svelte` | suggestions read only recall-bearing records | 2 |
| `src/lib/components/card/MemorizeCheckPanel.svelte` | report the typed attempt | 3 |
| `src/lib/quiz/session.ts` | `RoundResult.typed` | 3 |
| `src/lib/components/quiz/QuizTypingRound.svelte` | report the typed attempt | 3 |
| `src/routes/quiz/+page.svelte` | thread `typed` into the record | 3 |
| `src/lib/components/quiz/QuizOpeningRound.svelte` *(new)* | 첫 단어 | 4 |
| `src/lib/components/quiz/QuizSpotRound.svelte` *(new)* | 틀린 곳 찾기 | 5 |
| `src/lib/quiz/scope.ts` | `loadAttempts` | 6 |
| `src/lib/components/quiz/QuizScopePicker.svelte` | game axis, attempts count | 6 |
| `src/routes/quiz/+page.svelte` | render the chosen game, record its source | 7 |

Dependency chain: 1 is pure and depends on nothing; 2 consumes 1's threshold; 3 makes the attempt reach 2's rule; 4 and 5 are independent of each other; 6 consumes 1 and reads what 2 stores; 7 consumes everything.

---

### Task 1: Name the games

Pure. No database, no Svelte. Three games as data, so the picker, the route, the recorder and the tests all name them the same way.

**Files:**
- Create: `src/lib/quiz/games.ts`
- Test: `tests/unit/games.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Game = 'typing' | 'opening' | 'spot'`
  - `GAMES: readonly Game[]`
  - `GAME_LABELS: Record<Game, string>`
  - `GAME_SOURCE: Record<Game, 'quiz' | 'quiz-opening' | 'quiz-spot'>`
  - `RECALLABLE_MIN_ACCURACY = 0.9`
  - `isRecallableAttempt(accuracy: number): boolean`

Tasks 2, 6 and 7 all import from here.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/games.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	GAMES,
	GAME_LABELS,
	GAME_SOURCE,
	RECALLABLE_MIN_ACCURACY,
	isRecallableAttempt
} from '../../src/lib/quiz/games';

describe('games', () => {
	it('offers three games', () => {
		expect([...GAMES]).toEqual(['typing', 'opening', 'spot']);
	});

	it('labels each game in Korean', () => {
		expect(GAME_LABELS.typing).toBe('전체 타이핑');
		expect(GAME_LABELS.opening).toBe('첫 단어');
		expect(GAME_LABELS.spot).toBe('틀린 곳 찾기');
	});

	// Each game proves something different: passing on two words is not
	// knowing the verse, and spotting a planted error is recognition rather
	// than recall. One shared source would light the 만점 badge for typing
	// two words.
	it('gives each game its own source', () => {
		expect(GAME_SOURCE.typing).toBe('quiz');
		expect(GAME_SOURCE.opening).toBe('quiz-opening');
		expect(GAME_SOURCE.spot).toBe('quiz-spot');
		expect(new Set(Object.values(GAME_SOURCE)).size).toBe(3);
	});
});

describe('isRecallableAttempt', () => {
	// A verse abandoned after two words is not a question anybody can answer.
	it('rejects an attempt that collapsed', () => {
		expect(isRecallableAttempt(0)).toBe(false);
		expect(isRecallableAttempt(0.5)).toBe(false);
	});

	it('accepts an attempt at the threshold', () => {
		expect(isRecallableAttempt(RECALLABLE_MIN_ACCURACY)).toBe(true);
	});

	it('rejects the value just below the threshold', () => {
		expect(isRecallableAttempt(RECALLABLE_MIN_ACCURACY - 0.01)).toBe(false);
	});

	// A perfect attempt has nothing wrong to find, so it is not a question.
	it('rejects a perfect attempt', () => {
		expect(isRecallableAttempt(1)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/games.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/quiz/games"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/quiz/games.ts`:

```ts
/** The three ways the quiz can ask about a verse. */
export type Game = 'typing' | 'opening' | 'spot';

/** In picker order. */
export const GAMES = ['typing', 'opening', 'spot'] as const satisfies readonly Game[];

export const GAME_LABELS: Record<Game, string> = {
	typing: '전체 타이핑',
	opening: '첫 단어',
	spot: '틀린 곳 찾기'
};

/**
 * What a round of each game writes as its record's source.
 *
 * Three values rather than one because the games prove different things.
 * Passing on two words does not mean the verse is known, and spotting a
 * planted error is recognition rather than recall — written as one 'quiz',
 * the 만점 badge would light for typing two words.
 */
export const GAME_SOURCE: Record<Game, 'quiz' | 'quiz-opening' | 'quiz-spot'> = {
	typing: 'quiz',
	opening: 'quiz-opening',
	spot: 'quiz-spot'
};

/** How close an attempt must land to be worth keeping as a future question. */
export const RECALLABLE_MIN_ACCURACY = 0.9;

/**
 * Is this attempt worth keeping as a future 틀린 곳 찾기 question?
 *
 * Near-misses only. A verse abandoned after two words is not a
 * spot-the-difference question, and a perfect attempt has nothing wrong in it
 * to find — the point of keeping the sentence is to hand it back later and ask
 * what is wrong with it.
 */
export function isRecallableAttempt(accuracy: number): boolean {
	return accuracy >= RECALLABLE_MIN_ACCURACY && accuracy < 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/games.test.ts`
Expected: PASS, 7 tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz/games.ts tests/unit/games.test.ts
git commit -F - <<'EOF'
feat(quiz): name the three games and what each one proves

Each writes its own source, because they do not prove the same thing:
two words is not the verse, and finding a planted error is recognition
rather than recall. One shared value would light the 만점 badge for
typing two words.

isRecallableAttempt keeps only near-misses. A collapsed attempt is not
a spot-the-difference question, and a perfect one has nothing in it to
find.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Keep the attempt, and narrow who counts what

**Files:**
- Modify: `src/lib/db/local.ts` (the `CheckRecord` interface)
- Modify: `src/lib/db/checkHistory.ts` (`recordCheck`, a new predicate, `listPerfectVerseNos`)
- Modify: `src/lib/components/card/VerseCard.svelte:303` (the suggestions call)
- Test: `tests/unit/checkHistory.test.ts` (extend)

**Interfaces:**
- Consumes: `isRecallableAttempt` from `$lib/quiz/games` (Task 1).
- Produces:
  - `CheckRecord.typed?: string` and `CheckRecord.source?: 'quiz' | 'quiz-opening' | 'quiz-spot'`
  - `recordCheck`'s entry accepts `typed?: string` and the widened `source`
  - `countsAsRecall(r: Pick<CheckRecord, 'source'>): boolean` exported from `checkHistory.ts`

Tasks 3, 6 and 7 rely on these.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('checkHistory', ...)` block in `tests/unit/checkHistory.test.ts`:

```ts
	// Near-misses become future 틀린 곳 찾기 questions. The rule lives in
	// recordCheck so the card's check and the quiz's round cannot disagree
	// about what is worth keeping.
	it('keeps the sentence behind a near miss', async () => {
		await recordCheck('900_krv', 10, entry({ accuracy: 0.95, typed: '거의 맞은 문장' }), 1000);
		expect((await listChecks('900_krv', 10))[0].typed).toBe('거의 맞은 문장');
	});

	it('drops the sentence behind a collapse', async () => {
		await recordCheck('900_krv', 11, entry({ accuracy: 0.3, typed: '두 단어' }), 1000);
		expect((await listChecks('900_krv', 11))[0].typed).toBeUndefined();
	});

	// A perfect attempt has nothing wrong in it to find.
	it('drops the sentence behind a perfect attempt', async () => {
		await recordCheck('900_krv', 12, entry({ accuracy: 1, typed: '완벽한 문장' }), 1000);
		expect((await listChecks('900_krv', 12))[0].typed).toBeUndefined();
	});

	it('records which game produced a round', async () => {
		await recordCheck('900_krv', 13, entry({ source: 'quiz-opening' }), 1000);
		await recordCheck('900_krv', 14, entry({ source: 'quiz-spot' }), 1000);
		expect((await listChecks('900_krv', 13))[0].source).toBe('quiz-opening');
		expect((await listChecks('900_krv', 14))[0].source).toBe('quiz-spot');
	});
});

// The suggestions and the 만점 badge speak about recall. An opening round
// proves the reader can start a verse; a spot round proves they can recognise
// a mistake. Neither is evidence that the verse was recited.
describe('countsAsRecall', () => {
	it('counts a 점검 and a full typing round', () => {
		expect(countsAsRecall({ source: undefined })).toBe(true);
		expect(countsAsRecall({ source: 'quiz' })).toBe(true);
	});

	it('does not count the opening or spot games', () => {
		expect(countsAsRecall({ source: 'quiz-opening' })).toBe(false);
		expect(countsAsRecall({ source: 'quiz-spot' })).toBe(false);
	});
});

describe('listPerfectVerseNos with games', () => {
	it('does not light the badge from an opening round', async () => {
		await recordCheck('900_krv', 20, entry({ accuracy: 1, source: 'quiz-opening' }), 1000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set());
	});

	it('still lights it from a 점검 and from a full typing round', async () => {
		await recordCheck('900_krv', 21, entry({ accuracy: 1 }), 1000);
		await recordCheck('900_krv', 22, entry({ accuracy: 1, source: 'quiz' }), 1000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set([21, 22]));
	});

	// The latest *counted* record decides. A spot round landing after a
	// flawed check must not revive a badge the check took away.
	it('lets a later spot round neither give nor take the badge', async () => {
		await recordCheck('900_krv', 23, entry({ accuracy: 1 }), 1000);
		await recordCheck('900_krv', 23, entry({ accuracy: 0.5 }), 2000);
		await recordCheck('900_krv', 23, entry({ accuracy: 1, source: 'quiz-spot' }), 3000);
		expect(await listPerfectVerseNos('900_krv')).toEqual(new Set());
	});
```

Note the placement: the first four `it` blocks go **inside** the existing `describe('checkHistory', …)`, and the closing `});` shown above ends it. The three new `describe` blocks follow at top level.

Extend the import at the top of the file to include the new export:

```ts
import {
	HISTORY_LIMIT,
	countsAsRecall,
	listChecks,
	listPerfectVerseNos,
	recordCheck
} from '../../src/lib/db/checkHistory';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: FAIL — `countsAsRecall is not a function`, plus the `typed` assertions returning `undefined`/the stored value in the wrong direction, plus the badge tests seeing 20 and 23 in the set.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/db/local.ts`, widen `source` and add `typed` to `CheckRecord`, below `missed`:

```ts
	/** What produced this record. Absent means 점검 — every record written
	 *  before this field existed was one, and it is the app's primary act, so
	 *  the default already says the true thing about old rows. */
	source?: 'quiz' | 'quiz-opening' | 'quiz-spot';
	/** What the reader actually typed. Kept only for attempts that nearly
	 *  landed — see isRecallableAttempt. The 틀린 곳 찾기 game hands this back
	 *  and asks what is wrong with it, so a collapsed attempt is worth
	 *  nothing and a perfect one has nothing in it to find. */
	typed?: string;
```

Do **not** add a `this.version(9)` block.

In `src/lib/db/checkHistory.ts`:

Import the rule:

```ts
import { isRecallableAttempt } from '$lib/quiz/games';
```

Widen `recordCheck`'s entry type — replace `source?: 'quiz';` with:

```ts
		source?: 'quiz' | 'quiz-opening' | 'quiz-spot';
		typed?: string;
```

Inside the `put`, after the existing `missed` spread, add:

```ts
		// Kept only for a near miss. Deciding here rather than at each call
		// site means the card's 점검 and the quiz's typing round cannot
		// disagree about which sentences are worth handing back later.
		...(entry.typed !== undefined && isRecallableAttempt(entry.accuracy)
			? { typed: entry.typed }
			: {})
```

Add the predicate, above `listPerfectVerseNos`:

```ts
/**
 * Does this record say something about recall?
 *
 * 점검 and the quiz's full typing round do: the reader produced the verse
 * from memory. The opening game proves only that they can start it, and the
 * spot game proves they can recognise a mistake — neither is evidence that
 * the verse was recited, so neither may move the underline suggestions or the
 * 만점 badge.
 */
export function countsAsRecall(r: Pick<CheckRecord, 'source'>): boolean {
	return r.source === undefined || r.source === 'quiz';
}
```

In `listPerfectVerseNos`, filter the rows before choosing the latest per verse — the latest *counted* record decides, so a spot round can neither give the badge nor take it:

```ts
	for (const r of rows) {
		if (!countsAsRecall(r)) continue;
		const seen = latest.get(r.verseNo);
		if (!seen || r.checkedAt > seen.checkedAt) latest.set(r.verseNo, r);
	}
```

In `src/lib/components/card/VerseCard.svelte`, narrow the suggestions call at `:303`:

```ts
	const suggested = $derived(
		marking ? suggestedMarks(checkHistory.filter(countsAsRecall), totalWords) : new Set<number>()
	);
```

and extend that file's import from `$lib/db/checkHistory` to include `countsAsRecall`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/checkHistory.test.ts`
Expected: PASS, all tests in the file.

Run: `pnpm test tests/unit/VerseCard.suggest.test.ts`
Expected: PASS — the card's existing suggestion and history tests must survive the narrowing.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/local.ts src/lib/db/checkHistory.ts src/lib/components/card/VerseCard.svelte tests/unit/checkHistory.test.ts
git commit -F - <<'EOF'
feat(db): keep a near miss, and stop counting what is not recall

The 틀린 곳 찾기 game needs the sentence the reader actually typed, and
`missed` keeps positions only — the alignment that could recover the
rest is one this codebase already abandoned for giving two answers to
the same attempt. So the attempt is stored going forward, and only when
it nearly landed.

source now names which game wrote a record, and the suggestions and the
만점 badge count only records that say something about recall. Left as
they were, typing two words would light a badge that claims the verse
was recited.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Make the attempt reach the record

The rule from Task 2 only fires if something hands `recordCheck` a `typed`. Two callers do: the card's check panel, and the quiz's typing round through the route.

**Files:**
- Modify: `src/lib/components/card/MemorizeCheckPanel.svelte` (the `onGraded` prop type and both save paths)
- Modify: `src/lib/quiz/session.ts` (`RoundResult`)
- Modify: `src/lib/components/quiz/QuizTypingRound.svelte` (the verdict it builds)
- Modify: `src/routes/quiz/+page.svelte` (`finishRound`)
- Test: `tests/unit/MemorizeCheckPanel.test.ts` and `tests/unit/QuizTypingRound.test.ts` (extend)

**Interfaces:**
- Consumes: `recordCheck`'s `typed?: string` (Task 2).
- Produces: `RoundResult.typed?: string`; `onGraded`'s outcome gains `typed: string`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('MemorizeCheckPanel', …)` block in `tests/unit/MemorizeCheckPanel.test.ts`:

```ts
	// recordCheck decides whether to keep it, so the panel reports the
	// sentence on every save and stays out of the threshold's business.
	it('reports the sentence it graded', async () => {
		const { onGraded } = setup();
		const attempt = VERSE.replace('법도를', '법을');
		await type(attempt);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '저장' }));
		expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ typed: attempt }));
	});

	it('reports the sentence on a flawless attempt too', async () => {
		const { onGraded } = setup();
		await type(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ typed: VERSE }));
	});
```

Append inside the existing `describe('QuizTypingRound', …)` block in `tests/unit/QuizTypingRound.test.ts`:

```ts
	// The quiz's typing round is a 점검 without the rating, so its near
	// misses become 틀린 곳 찾기 questions the same way.
	it('reports the sentence it graded', async () => {
		const { onDone } = setup();
		const attempt = VERSE.replace('법도를', '법을');
		await type(attempt);
		await fireEvent.click(screen.getByRole('button', { name: '제출' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ typed: attempt }));
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/MemorizeCheckPanel.test.ts tests/unit/QuizTypingRound.test.ts`
Expected: FAIL — three tests, each reporting an outcome object with no `typed` key.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/quiz/session.ts`, add to `RoundResult`, below `missed`:

```ts
	/** What the reader typed, when this game produced a sentence worth
	 *  keeping. Only the typing round sets it; recordCheck decides whether it
	 *  is kept, so no round needs to know the threshold. */
	typed?: string;
```

In `src/lib/components/card/MemorizeCheckPanel.svelte`, add `typed: string;` to the `onGraded` prop's outcome type, and add `typed` to both `onGraded({ … })` call sites — the flawless branch in `submit()` and the one in `save()`. The component's state variable is already named `typed`, so `typed` alone is the shorthand.

In `src/lib/components/quiz/QuizTypingRound.svelte`, add `typed` to the object `submit()` assigns to `verdict`:

```ts
		verdict = {
			id: item.id,
			passed: accuracy >= 1,
			accuracy,
			missed: markMismatchedWords(item.w, typed).flatMap((m, i) => (m.ok ? [] : [i])),
			elapsedMs: Date.now() - startedAt,
			typed
		};
```

In `src/routes/quiz/+page.svelte`, pass it through in `finishRound`:

```ts
				missed: result.missed,
				typed: result.typed,
				source: 'quiz'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/MemorizeCheckPanel.test.ts tests/unit/QuizTypingRound.test.ts`
Expected: PASS, all tests in both files.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz/session.ts src/lib/components/card/MemorizeCheckPanel.svelte src/lib/components/quiz/QuizTypingRound.svelte src/routes/quiz/+page.svelte tests/unit/MemorizeCheckPanel.test.ts tests/unit/QuizTypingRound.test.ts
git commit -F - <<'EOF'
feat(check): hand the graded sentence on, and let the db decide

Both places that grade a whole verse now report what was typed. Neither
knows the threshold — recordCheck keeps a near miss and drops the rest —
so the card's 점검 and the quiz's typing round cannot come to different
conclusions about which sentences are worth asking about later.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: 첫 단어

**Files:**
- Modify: `src/lib/memorize/timing.ts` (extract `openingOf`)
- Create: `src/lib/components/quiz/QuizOpeningRound.svelte`
- Test: `tests/unit/timing.test.ts` (extend), `tests/unit/QuizOpeningRound.test.ts`

**Interfaces:**
- Consumes: `hasTypedOpening` and `openingOf` from `$lib/memorize/timing`; `QuizItem`, `RoundResult` from `$lib/quiz/session`.
- Produces: `openingOf(verse: string): string` exported from `timing.ts`, and a component with props `{ item: QuizItem; index: number; total: number; onDone: (result: RoundResult) => void }` — the same four the typing round takes, so the route treats them alike.

The pass rule is `hasTypedOpening(item.w, typed)`, used exactly as it stands. It compares under the grading normalization (so spacing never holds it open) and falls back for verses shorter than two words. Do not reimplement it and do not change `OPENING_WORDS`.

**`모르겠어요` has to show the opening, and that means extracting it.** `OPENING_WORDS` is private to `timing.ts` and `hasTypedOpening` computes the opening only to compare it. Writing `.slice(0, 2)` in the component would put the number in two places — which is the second definition of "has started this verse" the constraints forbid. So this task first pulls the phrase out of `hasTypedOpening` into an exported `openingOf`, and both callers use it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/QuizOpeningRound.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizOpeningRound from '../../src/lib/components/quiz/QuizOpeningRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

// 그들에게(0) 율례와(1) — two words is the opening.
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
	render(QuizOpeningRound, { item, index: 0, total: 3, onDone });
	return { onDone };
}

async function type(text: string) {
	await fireEvent.input(screen.getByRole('textbox'), { target: { value: text } });
}

describe('QuizOpeningRound', () => {
	it('shows the cue and hides the verse', () => {
		setup();
		expect(screen.getByText('출애굽기 18 : 20')).toBeInTheDocument();
		expect(screen.queryByText(VERSE)).toBeNull();
	});

	// No 제출 button: the point of this game is getting going, and hunting
	// for a button after two words erases it.
	it('has no submit button', () => {
		setup();
		expect(screen.queryByRole('button', { name: '제출' })).toBeNull();
	});

	it('passes the moment the opening is produced', async () => {
		setup();
		await type('그들에게 율례와');
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
	});

	it('is not satisfied by one word', async () => {
		setup();
		await type('그들에게');
		expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
	});

	// Korean spacing is a spelling problem, not a recall failure — the shared
	// normalization decides, not the space bar.
	it('is not decided by spacing', async () => {
		setup();
		await type('그들에게율례와');
		expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
	});

	it('reports a pass only when 다음 is pressed', async () => {
		const { onDone } = setup();
		await type('그들에게 율례와');
		expect(onDone).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, accuracy: 1, missed: [] })
		);
	});

	it('reveals the opening and fails on 모르겠어요', async () => {
		const { onDone } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));
		expect(screen.getByText('그들에게 율례와')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ passed: false, accuracy: 0 })
		);
	});

	// The route advances its index off onDone, so a second report would skip
	// the next verse entirely.
	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone } = setup();
		await type('그들에게 율례와');
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('says which round this is', () => {
		setup();
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/QuizOpeningRound.test.ts`
Expected: FAIL — cannot resolve `QuizOpeningRound.svelte`.

- [ ] **Step 3: Write minimal implementation**

First, in `src/lib/memorize/timing.ts`, export the phrase and let
`hasTypedOpening` use it:

```ts
/**
 * The words that count as having started this verse.
 *
 * Exported because 첫 단어 has to *show* the opening when the reader gives up,
 * and slicing it again at the call site would put OPENING_WORDS in two places
 * — two definitions of the same thing, drifting apart the first time either
 * moves.
 */
export function openingOf(verse: string): string {
	return verse.trim().split(/\s+/).filter(Boolean).slice(0, OPENING_WORDS).join(' ');
}
```

and rewrite `hasTypedOpening`'s first two lines to read it:

```ts
export function hasTypedOpening(verse: string, typed: string): boolean {
	const opening = normalizeForGrading(openingOf(verse));
	if (opening.length === 0) return false;
	return normalizeForGrading(typed).startsWith(opening);
}
```

Add to `tests/unit/timing.test.ts`:

```ts
describe('openingOf', () => {
	it('is the first two words', () => {
		expect(openingOf('그들에게 율례와 법도를 가르쳐서')).toBe('그들에게 율례와');
	});

	// A one-word verse still has an opening, so its clock can stop.
	it('falls back to what a short verse has', () => {
		expect(openingOf('여호와여')).toBe('여호와여');
	});

	it('is empty for an empty verse', () => {
		expect(openingOf('   ')).toBe('');
	});
});
```

extending that file's import from `../../src/lib/memorize/timing` to include
`openingOf`.

Then create `src/lib/components/quiz/QuizOpeningRound.svelte`:

```svelte
<script lang="ts">
	import { hasTypedOpening, openingOf } from '$lib/memorize/timing';
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
	/** Set by 모르겠어요. A revealed opening is a failure however the reader
	 *  types afterwards. */
	let gaveUp = $state(false);
	let reported = $state(false);

	/** Measured from when the round appears, not from the first keystroke —
	 *  the pause before starting is part of recalling how a verse opens. */
	const startedAt = Date.now();

	/** The words that count as having started. Shown only after 모르겠어요.
	 *  Borrowed from timing.ts rather than sliced here — the number lives in
	 *  one place or it is two definitions of the same thing. */
	const opening = $derived(openingOf(item.w));

	/** Graded continuously — there is no 제출. Leaving is still a separate
	 *  step, so the reader sees the verdict before the round is swapped out. */
	const done = $derived(gaveUp || hasTypedOpening(item.w, typed));

	function next() {
		if (!done || reported) return;
		reported = true;
		onDone({
			id: item.id,
			passed: !gaveUp,
			// A verdict, not a measurement: 1 means "started it", not "recited
			// it". Nothing counts quiz-opening as recall.
			accuracy: gaveUp ? 0 : 1,
			missed: [],
			elapsedMs: Date.now() - startedAt
		});
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

	<textarea
		bind:value={typed}
		aria-label="구절 첫머리 입력"
		rows="2"
		class="mt-3 w-full resize-none rounded-xl bg-[var(--color-elevated)] p-3 text-[calc(16px*var(--vfs))] leading-[1.8] text-[var(--color-text)]"
	></textarea>

	{#if gaveUp}
		<p class="mt-2 text-[calc(16px*var(--vfs))] font-medium text-[var(--color-text)]">{opening}</p>
	{/if}

	{#if done}
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{gaveUp ? '다시 볼 구절' : '통과'}
		</p>
		<button
			type="button"
			onclick={next}
			class="mt-2 w-full rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다음
		</button>
	{:else}
		<button
			type="button"
			onclick={() => (gaveUp = true)}
			class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			모르겠어요
		</button>
	{/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/QuizOpeningRound.test.ts`
Expected: PASS, 9 tests.

Run: `pnpm test tests/unit/timing.test.ts`
Expected: PASS — 3 new plus the file's existing tests, which must survive the extraction unchanged.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memorize/timing.ts src/lib/components/quiz/QuizOpeningRound.svelte tests/unit/timing.test.ts tests/unit/QuizOpeningRound.test.ts
git commit -F - <<'EOF'
feat(quiz): a round that only asks you to get started

Graded continuously against hasTypedOpening — the app already decided
two words is the answer and wrote down why 3–8 was the wrong size for a
judgement, so this borrows the rule rather than inventing a second one.

No 제출: hunting for a button after two words is the thing this game
exists to avoid. Leaving is still its own step, so the verdict is seen
before the round is swapped out.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: 틀린 곳 찾기

**Files:**
- Create: `src/lib/components/quiz/QuizSpotRound.svelte`
- Test: `tests/unit/QuizSpotRound.test.ts`

**Interfaces:**
- Consumes: `markMismatchedWords` from `$lib/memorize/grade`; `QuizItem`, `RoundResult` from `$lib/quiz/session`.
- Produces: a component with props `{ item: QuizItem; shown: string; index: number; total: number; onDone: (result: RoundResult) => void }`. `shown` is what to display — the route supplies a recorded attempt, or `item.w` when there is none.

Grading is `markMismatchedWords(shown, item.w)` — the arguments reversed, which is the call `MemorizeCheckPanel` already makes at `:203` to mark the reader's own words. It returns which words of the **shown** text do not belong. Nothing about which words are wrong is stored; it is recomputed here.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/QuizSpotRound.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import QuizSpotRound from '../../src/lib/components/quiz/QuizSpotRound.svelte';
import type { QuizItem } from '../../src/lib/quiz/session';

// 그들에게(0) 율례와(1) 법도를(2) 가르쳐서(3) …
const VERSE = '그들에게 율례와 법도를 가르쳐서 마땅히 갈 길과 할 일을 그들에게 보이고';
const FLAWED = VERSE.replace('법도를', '법을');

const item: QuizItem = {
	id: '900_krv:127',
	packageId: '900_krv',
	verseNo: 127,
	title: '양  육',
	cite: '출애굽기 18 : 20',
	w: VERSE
};

function setup(shown: string) {
	const onDone = vi.fn();
	const { container } = render(QuizSpotRound, { item, shown, index: 1, total: 4, onDone });
	return { onDone, container };
}

const wordAt = (container: HTMLElement, i: number) => container.querySelectorAll('.word')[i];

describe('QuizSpotRound', () => {
	it('shows the sentence it was given, not the verse', () => {
		const { container } = setup(FLAWED);
		expect(container.textContent).toContain('법을');
		expect(container.textContent).not.toContain('법도를');
	});

	it('accepts a tap on the word that does not belong', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 2));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(
			expect.objectContaining({ id: '900_krv:127', passed: true, accuracy: 1, missed: [] })
		);
	});

	it('rejects a tap on a word that is fine', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 0));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false, accuracy: 0 }));
	});

	// A verse with no recorded attempt is shown as it really is, and 이상 없음
	// is the answer. Early on this is most rounds, which is why the picker
	// says how many real questions a scope holds.
	it('accepts 이상 없음 when the verse is shown intact', async () => {
		const { onDone } = setup(VERSE);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
	});

	it('rejects 이상 없음 when something is wrong', async () => {
		const { onDone } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		await fireEvent.click(screen.getByRole('button', { name: '다음' }));
		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
	});

	it('marks the wrong word once the answer is in', async () => {
		const { container } = setup(FLAWED);
		await fireEvent.click(screen.getByRole('button', { name: '이상 없음' }));
		expect(wordAt(container, 2)).toHaveClass('wrong');
	});

	it('reports once even if 다음 is tapped twice', async () => {
		const { onDone, container } = setup(FLAWED);
		await fireEvent.click(wordAt(container, 2));
		const next = screen.getByRole('button', { name: '다음' });
		await fireEvent.click(next);
		await fireEvent.click(next);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('says which round this is', () => {
		setup(FLAWED);
		expect(screen.getByText('2 / 4')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/QuizSpotRound.test.ts`
Expected: FAIL — cannot resolve `QuizSpotRound.svelte`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/components/quiz/QuizSpotRound.svelte`:

```svelte
<script lang="ts">
	import { markMismatchedWords } from '$lib/memorize/grade';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';

	interface Props {
		item: QuizItem;
		/** The text to show: a recorded attempt, or the verse itself when the
		 *  reader has none for it. */
		shown: string;
		index: number;
		total: number;
		onDone: (result: RoundResult) => void;
	}
	let { item, shown, index, total, onDone }: Props = $props();

	/** The reader's answer: a word index, or null for 이상 없음. Undefined
	 *  while they are still deciding. */
	let answer = $state<number | null | undefined>(undefined);
	let reported = $state(false);

	const startedAt = Date.now();

	const words = $derived(shown.trim().split(/\s+/).filter(Boolean));

	/** Which words of the shown text do not belong. Recomputed rather than
	 *  stored: a second copy of a fact can disagree with the first, and the
	 *  verse is right here to compare against. */
	const wrong = $derived(
		markMismatchedWords(shown, item.w).flatMap((m, i) => (m.ok ? [] : [i]))
	);

	const answered = $derived(answer !== undefined);
	const correct = $derived(answer === null ? wrong.length === 0 : wrong.includes(answer as number));

	function choose(a: number | null) {
		if (answered) return;
		answer = a;
	}

	function next() {
		if (!answered || reported) return;
		reported = true;
		onDone({
			id: item.id,
			passed: correct,
			// A verdict, not a measurement: 1 means "found it", not "recited
			// it". Nothing counts quiz-spot as recall.
			accuracy: correct ? 1 : 0,
			missed: [],
			elapsedMs: Date.now() - startedAt
		});
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

	<p class="mt-3 text-[calc(16px*var(--vfs))] leading-[1.9] break-keep">
		{#each words as word, i (i)}<span
			class="word"
			class:tappable={!answered}
			class:wrong={answered && wrong.includes(i)}
			class:picked={answer === i}
			role={answered ? undefined : 'button'}
			tabindex={answered ? undefined : 0}
			onclick={answered ? undefined : () => choose(i)}
			onkeydown={answered
				? undefined
				: (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							choose(i);
						}
					}}>{word}</span
		>{' '}{/each}
	</p>

	{#if answered}
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{correct ? '맞았습니다' : '다시 볼 구절'}
		</p>
		<button
			type="button"
			onclick={next}
			class="mt-2 w-full rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다음
		</button>
	{:else}
		<button
			type="button"
			onclick={() => choose(null)}
			class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			이상 없음
		</button>
	{/if}
</div>

<style>
	/* Before the answer every word is a target; the cursor and a hover tint
	   are the cue, as in the card's marking mode. */
	.tappable {
		cursor: pointer;
		border-radius: 4px;
	}
	.tappable:hover {
		background-color: var(--color-accent-soft);
	}
	/* What the reader picked, right or not. */
	.picked {
		background-color: var(--color-accent-soft);
		border-radius: 4px;
	}
	/* The word that actually does not belong. Red rather than the accent:
	   this is the result of a test, not a note the reader left themselves. */
	.wrong {
		color: var(--color-danger);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/QuizSpotRound.test.ts`
Expected: PASS, 8 tests.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/quiz/QuizSpotRound.svelte tests/unit/QuizSpotRound.test.ts
git commit -F - <<'EOF'
feat(quiz): show the reader their own mistake and ask them to find it

The sentence on screen is one they actually typed, not a verse
corrupted on purpose — a synthesised 조사 swap asks whether they can
spot an anomaly, their own sentence asks whether they can spot the
place they personally go wrong.

Which words do not belong is recomputed from the verse rather than
stored, the same rule the underline suggestions follow: a second copy
of a fact can disagree with the first.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Choosing a game, and how many real questions a scope holds

**Files:**
- Modify: `src/lib/quiz/scope.ts` (add `loadAttempts`)
- Modify: `src/lib/components/quiz/QuizScopePicker.svelte`
- Test: `tests/unit/quizScope.test.ts` and `tests/unit/QuizScopePicker.test.ts` (extend)

**Interfaces:**
- Consumes: `Game`, `GAMES`, `GAME_LABELS` from `$lib/quiz/games` (Task 1); `CheckRecord.typed` (Task 2).
- Produces:
  - `loadAttempts(items: QuizItem[]): Promise<Map<string, string>>` from `scope.ts`
  - `QuizScopePicker`'s `onStart` becomes `(queue: QuizItem[], game: Game) => void`

Task 7 consumes both.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/quizScope.test.ts`. Add `loadAttempts` to that file's import from `../../src/lib/quiz/scope`, and `recordCheck` from `../../src/lib/db/checkHistory`:

```ts
describe('loadAttempts', () => {
	const item = (packageId: string, verseNo: number) => ({
		id: `${packageId}:${verseNo}`,
		packageId,
		verseNo,
		title: 't',
		cite: 'c',
		w: 'w'
	});

	it('returns nothing when no attempt was ever kept', async () => {
		expect((await loadAttempts([item('a_krv', 1)])).size).toBe(0);
	});

	it('returns the stored attempt for a verse that has one', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '거의 맞은 문장' } as never, 1000);
		expect((await loadAttempts([item('a_krv', 1)])).get('a_krv:1')).toBe('거의 맞은 문장');
	});

	// The most recent record with an attempt — not the most recent record,
	// which may well be a later clean check that kept nothing.
	it('is not erased by a later clean check', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '거의 맞은 문장' } as never, 1000);
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 1, elapsedMs: 1 } as never, 2000);
		expect((await loadAttempts([item('a_krv', 1)])).get('a_krv:1')).toBe('거의 맞은 문장');
	});

	it('prefers the newer of two stored attempts', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '먼저' } as never, 1000);
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: '나중' } as never, 2000);
		expect((await loadAttempts([item('a_krv', 1)])).get('a_krv:1')).toBe('나중');
	});

	it('keeps two packages\' verse 1 apart', async () => {
		await recordCheck('a_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: 'A' } as never, 1000);
		await recordCheck('b_krv', 1, { start: null, full: null, accuracy: 0.95, elapsedMs: 1, typed: 'B' } as never, 1000);
		const got = await loadAttempts([item('a_krv', 1), item('b_krv', 1)]);
		expect(got.get('a_krv:1')).toBe('A');
		expect(got.get('b_krv:1')).toBe('B');
	});
});
```

Append to `tests/unit/QuizScopePicker.test.ts`, and add `vi.mock` for the attempts read at the top of the file, directly after the imports:

```ts
vi.mock('../../src/lib/quiz/scope', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/quiz/scope')>()),
	loadAttempts: vi.fn(async () => new Map([['a_krv:1', '거의 맞은 문장']]))
}));
```

```ts
describe('QuizScopePicker — games', () => {
	it('offers the three games and starts on 전체 타이핑', () => {
		setup();
		expect(screen.getByRole('button', { name: '전체 타이핑' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: '첫 단어' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '틀린 곳 찾기' })).toBeInTheDocument();
	});

	it('tells onStart which game was chosen', async () => {
		const { onStart } = setup();
		await fireEvent.click(screen.getByRole('button', { name: '첫 단어' }));
		await fireEvent.click(screen.getByRole('button', { name: '시작' }));
		expect(onStart.mock.calls[0][1]).toBe('opening');
	});

	// Early on most verses have no recorded attempt, and without this line the
	// winning strategy is to press 이상 없음 every round.
	it('says how many real questions 틀린 곳 찾기 has', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: '틀린 곳 찾기' }));
		await waitFor(() =>
			expect(screen.getByText('2구절 중 1개에 내 오답 기록이 있습니다')).toBeInTheDocument()
		);
	});

	it('says nothing about attempts for the other games', () => {
		setup();
		expect(screen.queryByText(/내 오답 기록이 있습니다/)).toBeNull();
	});
});
```

Add `waitFor` to that file's import from `@testing-library/svelte`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/quizScope.test.ts tests/unit/QuizScopePicker.test.ts`
Expected: FAIL — `loadAttempts is not a function`, and the game chips not found.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/quiz/scope.ts`, add:

```ts
/**
 * Per verse, the `typed` of its most recent record that has one.
 *
 * Not the most recent record — that may well be a later clean check, which
 * keeps no attempt. A verse whose attempt was recorded weeks ago is still a
 * question worth asking; the point is to hand back the sentence the reader
 * actually wrote, whenever they wrote it.
 *
 * Keyed by QuizItem.id. Verses with no stored attempt are absent, so the
 * picker can count the map's size to say how many real questions a scope holds.
 */
export async function loadAttempts(items: QuizItem[]): Promise<Map<string, string>> {
	const wanted = new Set(items.map((i) => i.id));
	const out = new Map<string, string>();
	const newest = new Map<string, number>();

	for (const packageId of new Set(items.map((i) => i.packageId))) {
		const rows = await db.checkHistory.where('verseKey').startsWith(`${packageId}:`).toArray();
		for (const r of rows) {
			if (r.typed === undefined) continue;
			const id = `${r.packageId}:${r.verseNo}`;
			if (!wanted.has(id)) continue;
			if ((newest.get(id) ?? -Infinity) >= r.checkedAt) continue;
			newest.set(id, r.checkedAt);
			out.set(id, r.typed);
		}
	}

	return out;
}
```

In `src/lib/components/quiz/QuizScopePicker.svelte`:

Import the games and the attempts read:

```ts
	import { GAMES, GAME_LABELS, type Game } from '$lib/quiz/games';
	import { loadAttempts, type Target } from '$lib/quiz/scope';
```

Widen the `onStart` prop type to `(queue: QuizItem[], game: Game) => void`, and add state:

```ts
	/** One game for the whole session. 전체 타이핑 is the default because it
	 *  is the one that works on every verse from the first day. */
	let game = $state<Game>('typing');

	/** How many of the queue's verses have a sentence to ask about. Loaded
	 *  only for 틀린 곳 찾기 — the other two games never need it. */
	let attemptCount = $state<number | null>(null);

	$effect(() => {
		if (game !== 'spot') {
			attemptCount = null;
			return;
		}
		const forQueue = queue;
		loadAttempts(forQueue)
			.then((m) => {
				if (forQueue !== queue) return;
				attemptCount = m.size;
			})
			.catch(() => {
				if (forQueue !== queue) return;
				attemptCount = 0;
			});
	});
```

Add the 게임 section above the count row, following the 난이도 section's markup:

```svelte
	<div>
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">게임</h2>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each GAMES as g (g)}
				<button
					type="button"
					onclick={() => (game = g)}
					aria-pressed={game === g}
					class="rounded-full px-2.5 py-1 text-[12px] {game === g
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
				>
					{GAME_LABELS[g]}
				</button>
			{/each}
		</div>
		{#if game === 'spot' && attemptCount !== null}
			<p class="mt-2 text-[12px] text-[var(--color-text-tertiary)]">
				{queue.length}구절 중 {attemptCount}개에 내 오답 기록이 있습니다
			</p>
		{/if}
	</div>
```

and change the start button's handler to `onclick={() => onStart(queue, game)}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/quizScope.test.ts tests/unit/QuizScopePicker.test.ts`
Expected: PASS, all tests in both files.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz/scope.ts src/lib/components/quiz/QuizScopePicker.svelte tests/unit/quizScope.test.ts tests/unit/QuizScopePicker.test.ts
git commit -F - <<'EOF'
feat(quiz): pick a game, and see how many real questions it has

One game per session, chosen beside the scope. 틀린 곳 찾기 also says how
many of the chosen verses have a sentence to ask about — early on most
have none, and without that line pressing 이상 없음 every round is the
winning strategy.

The attempts read happens only for that game; the other two never need
it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Wire the games into the route

The last task. No new unit tests: this repo renders no `+page.svelte` under vitest. Verified by the browser walk below.

**Files:**
- Modify: `src/routes/quiz/+page.svelte`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing further.

- [ ] **Step 1: Hold the game and the attempts**

In `src/routes/quiz/+page.svelte`, add the imports:

```ts
	import QuizOpeningRound from '$lib/components/quiz/QuizOpeningRound.svelte';
	import QuizSpotRound from '$lib/components/quiz/QuizSpotRound.svelte';
	import { GAME_SOURCE, type Game } from '$lib/quiz/games';
	import { loadAttempts } from '$lib/quiz/scope';
```

Add state beside `queue`:

```ts
	let game = $state<Game>('typing');
	/** Recorded attempts for the verses in play, keyed by QuizItem.id. Empty
	 *  for the other two games, and for verses the reader has never nearly
	 *  landed. */
	let attempts = $state<Map<string, string>>(new Map());
```

Change `start` to take the game and load what the spot round needs:

```ts
	function start(picked: QuizItem[], chosen: Game) {
		queue = picked;
		game = chosen;
		index = 0;
		results = [];
		unsaved = 0;
		attempts = new Map();
		if (chosen !== 'spot') return;
		const forRun = picked;
		loadAttempts(picked)
			.then((m) => {
				if (forRun !== queue) return;
				attempts = m;
			})
			.catch(() => {});
	}
```

- [ ] **Step 2: Render the chosen game**

Replace the `{#key}` block's contents so the game decides the component. Keep the key exactly as it is — it guards a repeated verse, which the next phase makes possible:

```svelte
		{#key `${index}:${queue[index].id}`}
			{#if game === 'opening'}
				<QuizOpeningRound item={queue[index]} {index} total={queue.length} onDone={finishRound} />
			{:else if game === 'spot'}
				<QuizSpotRound
					item={queue[index]}
					shown={attempts.get(queue[index].id) ?? queue[index].w}
					{index}
					total={queue.length}
					onDone={finishRound}
				/>
			{:else}
				<QuizTypingRound item={queue[index]} {index} total={queue.length} onDone={finishRound} />
			{/if}
		{/key}
```

- [ ] **Step 3: Record with the game's own source**

In `finishRound`, replace the hardcoded `source: 'quiz'`:

```ts
				typed: result.typed,
				source: GAME_SOURCE[game]
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS. The branch started at 1303; this plan adds 7 + 9 + 3 + 12 + 8 + 9 = 48, so expect **1351**. If the totals disagree, report the real numbers rather than adjusting the expectation.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Walk it in a browser**

```bash
pnpm dev
```

1. Open `/quiz`. The 게임 section offers three chips with 전체 타이핑 selected.
2. Choose 첫 단어 and start a small scope. Typing the first two words shows 통과 with no 제출 press; 다음 advances. 모르겠어요 reveals the opening and marks the round failed.
3. Choose 틀린 곳 찾기 on a scope with no history: the picker says `N구절 중 0개…`, every round shows the verse itself, and 이상 없음 is correct.
4. Run 전체 타이핑 on a verse and get exactly one word wrong. In DevTools, that record now carries `typed`.
5. Choose 틀린 곳 찾기 again. The picker's count has moved, that verse shows the sentence you just typed, and tapping the wrong word is correct.
6. On the verse card: the 만점 배지 does **not** light from an opening round, and the underline suggestions do not move from a spot round.

Step 6 is the one that proves the `source` widening did what it claims — the rest passes with every game writing `'quiz'`.

Delete any rows you seeded when you are done.

- [ ] **Step 6: Commit**

```bash
git add src/routes/quiz/+page.svelte
git commit -F - <<'EOF'
feat(quiz): let the route ask in whichever way was chosen

One game for the session, and each round records under its own source,
so the suggestions and the 만점 badge keep hearing only from the games
that are about recall.

The spot round's sentences are loaded once when the run starts, and
only for that game — a verse with none is shown intact, which makes
이상 없음 the honest answer rather than a fallback.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Out of scope — do not build

Named because the spec rules them out and each is a plausible unprompted addition:

- Choosing a game per verse automatically — Phase C.
- Any priority, weighting, or repetition in the queue. `buildQueue` is not touched by this plan, and must not be given the game.
- Synthesising a wrong verse: no 조사 swaps, no substituted words, no deliberate corruption.
- Storing which words are wrong. It is recomputed at round time.
- Changing `OPENING_WORDS`, or adding a second notion of "has started this verse".
- Difficulty ratings from any quiz round — `start` and `full` stay `null`.
- Any change to `src/lib/sync/`, or a Dexie `version(9)`.
