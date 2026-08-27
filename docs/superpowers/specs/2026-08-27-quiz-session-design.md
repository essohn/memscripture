# Quiz Session — Design

**Status:** Approved (2026-08-27) · Phase A of three.
Phase B adds the first-words and spot-the-error games; Phase C adds priority
scheduling. Each gets its own spec.

**Depends on:** `2026-08-26-miss-history-and-mark-suggestions-design.md` —
this reads and writes the same `checkHistory` records.

## Problem

The app has one way to test recall: 점검, a typing check on a single verse
card. It is a per-verse act, entered from the card, and it produces a
difficulty rating. There is no way to say "run me through this 암송 DAY" and
be taken through the verses one after another.

That gap matters most for the verses the reader keeps getting wrong. Phase 1
now records which words go wrong on each check, but nothing yet uses that to
decide *what to practise* — only what to underline.

This spec adds a **quiz session**: pick a scope, get taken through its verses
one at a time, type each from memory, see how it went.

## Non-Goals

- **The other two games.** Typing-to-pass only. The first-words game and the
  spot-the-error game are Phase B, and this spec leaves them a seam rather
  than anticipating them.
- **Priority and repetition.** The queue keeps whatever order the scope produced. Which verses
  come up more often, and how a pass lowers a verse's priority, is Phase C.
  See "The seam for Phase C".
- **Resuming an interrupted session.** The session lives in memory. Reload and
  it is gone. Persisting it means deciding what a half-finished quiz means
  when the scope has since changed, which is not worth answering yet.
- **Scores, streaks, or a quiz statistics screen.** The summary at the end of
  a run is the whole of the reporting.
- **Replacing 점검.** The card's check stays exactly as it is. The quiz does
  not produce difficulty ratings — see "What a quiz round does not do".

## User-facing behavior

One route, three states:

```
홈 ─[퀴즈 카드]→ /quiz  (범위 고르기)
                   └─[시작]→ 라운드 → 라운드 → … → 결과 요약
```

Kept on one route on purpose. The session lives in memory, so a route change
would need it persisted, and persisting it is a non-goal above.

**Scope picking.** Two axes on one screen:

| Axis | Choices | Source |
|---|---|---|
| 대상 | each active 암송 DAY · each installed package | `activeEvents()` + `buildEventCards()`, which already resolve ranges to verse numbers |
| 난이도 | multi-select chips — xHard · Hard · Normal · Easy · xEasy · 미평가 | `hardestLevel()` from `verses/difficultySort.ts` |

Difficulty is a **filter, not a target**. "Quiz me on the hard ones" narrows a
chosen 대상; it is not a population of its own, because "the Hard ones of
what?" has no answer without one.

An empty selection disables 시작 and says why it is empty rather than starting
a session with nothing in it.

**The picker shows the resolved verse count next to 시작**, and that is the
whole guard against an unreasonable session. A 암송 DAY is typically ten to
thirty verses; a whole 900구절 package is not a quiz, and a reader who sees
"900구절" before pressing 시작 will narrow it or pick something else. No cap
is imposed: capping would silently drop verses from a scope the reader chose,
which is worse than letting them see the number and decide.

**A round.** The verse's title and citation are the cue; the body is not
shown. The reader types it and submits.

- **Exact match → pass.** "Exact" is `accuracyOf(verse, typed) >= 1`, the
  same definition the card's check already uses for a flawless attempt, so
  spacing and punctuation do not decide it (`normalizeForGrading` strips
  them — Korean spacing is a spelling problem, not a recall failure).
- **Anything else → the words that went wrong are marked**, and the round
  advances. No retry: pass and fail stay one-to-one with attempts, and a
  second try would make "did they know it?" unanswerable — which is exactly
  the question Phase C's priority has to read.

`elapsedMs` is measured from when the round is shown, not from the first
keystroke — the pause before starting to type is part of recalling the verse,
and the card's check measures it the same way.

**The end.** One pass through the scope. The summary names how many passed
and which verses did not.

## What a quiz round does not do

It proposes no difficulty rating. 점검's ratings are a considered judgement
the reader confirms, and a quiz is a fast run of many verses; minting ratings
from it would flood a scale the reader curates by hand. `start` and `full` are
written as `null`, which `recordCheck` already accepts and which
`isMemorized()` already treats as not-yet-rated.

## The seam for Phase C

```ts
export function buildQueue(
  items: QuizItem[],
  tiers: Set<Tier>,
  ratings: Map<string, { start: DifficultyLevel | null; full: DifficultyLevel | null }>
): QuizItem[]
```

Phase A's body is a filter that keeps the order it was given. Phase C replaces
that order with priority. Naming the seam now is the point: without it,
scheduling arrives later as changes spread across the session, the picker and
the route.

**Phase A does not re-sort.** The items arrive in the order the scope produced
them — for an 암송 DAY, the order its `ranges` are written in, which is the
order the reader knows the day by. Sorting by verse number would scramble a
day whose ranges span two packages, and would do it to impose an order nobody
asked for.

## Data

One optional field on the existing record:

```ts
// src/lib/db/local.ts — CheckRecord
/** What produced this record. Absent means 점검 — every record written
 *  before this field existed was one, and it is the app's primary act. */
source?: 'quiz';
```

**No Dexie version bump, no sync change.** `source` is not an index, and
`merge.ts` unions whole `checkHistory` records. The same reasoning as `missed`
in Phase 1, for the same reason.

Absent-means-점검 is deliberate. A required `source: 'check' | 'quiz'` would
have to be backfilled onto every existing row; letting the default carry the
meaning the old data already has costs nothing.

### Who counts a quiz record

Four readers of one table want different things, so each is stated:

| Reader | Quiz records | Why |
|---|---|---|
| 밑줄 제안 (`suggestedMarks`) | **counted** | A quiz round is a 점검 without the rating — same act, same evidence about which words fail |
| The card's 지난 점검 list | **excluded** | That list counts 점검, and its label says so |
| 만점 배지 (`listPerfectVerseNos`) | **counted** | The badge means "this verse is solid right now", and a quiz pass is that evidence |
| Phase C scheduling | counted (decided in C) | |

### The cost this accepts

`HISTORY_LIMIT` is 10, so quiz rounds share those ten slots with 점검 records.
Five quiz runs of a verse push its 점검 records out of the five-check
suggestion window.

For suggestions that is not a loss — the same kind of evidence, more of it.
For the card's 지난 점검 list it is visible: the list gets shorter as quizzing
displaces it. Left as it is. Raising the limit would make every sync snapshot
heavier to fix a problem nobody has reported yet; if it becomes irritating in
use, that is the moment to raise it, and the fix is one constant.

## Components

### `src/lib/quiz/session.ts` (new)

Pure. No I/O, no Svelte.

```ts
/** 1–5 as `DifficultyLevel` means rated; null is the 미평가 chip. */
export type Tier = DifficultyLevel | null;

export interface QuizItem {
  /** `${packageId}:${verseNo}` — the same composite key the db rows use. */
  id: string;
  packageId: string;
  verseNo: number;
  title: string;
  cite: string;
  w: string;
}

export interface RoundResult {
  /** QuizItem.id, not a verse number. */
  id: string;
  passed: boolean;
  accuracy: number;
  missed: number[];
  elapsedMs: number;
}

/** The verses a scope actually serves, in the order they will be asked.
 *  Phase A: filter by tier, keeping the order the scope produced.
 *  `ratings` is keyed by QuizItem.id — see "Why the composite key". */
export function buildQueue(
  items: QuizItem[],
  tiers: Set<Tier>,
  ratings: Map<string, { start: DifficultyLevel | null; full: DifficultyLevel | null }>
): QuizItem[];

/** What the end screen reports. */
export function summarize(results: RoundResult[]): {
  passed: number;
  total: number;
  failed: string[];
};
```

A verse with no rating has `hardestLevel() === null` and belongs to the
미평가 tier — it is not silently dropped, because an unrated verse is
usually one that has had the least attention.

The rating shape is the one `hardestLevel()` in `verses/difficultySort.ts`
already takes (`{ start, full }`), not the `VerseRating` row in
`db/local.ts`. Two types share that name; this is the display-side one.

### Why the composite key

A `MemEvent` holds `ranges: EventRange[]`, and each range names its own
`packageId` — so **one 암송 DAY can span packages**, and verse 12 of 100구절
and verse 12 of 900구절 can both be in the same session. Keying anything in
this module by verse number alone would let one verse's difficulty decide the
other's fate, and would report the wrong verse as failed in the summary.

`${packageId}:${verseNo}` is what `verseRatings`, `verseMarks` and
`checkHistory` already use for exactly this reason.

### `src/lib/memorize/typing.ts` (new)

```ts
/** Korean input commits a syllable with Enter, so an Enter arriving mid-
 *  composition is not a submit. Shift+Enter is a newline. */
export function submitsOnEnter(e: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}): boolean;
```

Extracted from `MemorizeCheckPanel`, which keeps this rule inline today. A
second typing surface is about to exist; duplicating the rule guarantees a day
when only one of them is fixed. `MemorizeCheckPanel` is changed to call it.

### `src/lib/db/checkHistory.ts`

`recordCheck`'s entry accepts `source?: 'quiz'`. That is the only change here.

**`listChecks` is not given a filter.** `VerseCard` holds one `checkHistory`
state that feeds two consumers with different needs — the panel's 지난 점검
list (점검 only) and `suggestedMarks` (everything). A filter at the query
would force a second read to serve the other. The card filters where the two
diverge instead:

```svelte
history={checkHistory.filter((r) => !r.source)}
```

One read, one state, and the divergence stated at the point where it exists.

### Components under `src/lib/components/quiz/`

- `QuizScopePicker.svelte` — 대상 list and 난이도 chips; reports the resolved
  verse count and disables 시작 at zero.
- `QuizTypingRound.svelte` — cue, textarea, submit, then the marked result.
  **Not** `MemorizeCheckPanel`: that component is 780 lines carrying rating
  pickers, hints, dictation, 포기 and per-verse history, and a round needs a
  cue, an input and a verdict. The *grading* is shared — `accuracyOf` and
  `markMismatchedWords` — which is the part that must not diverge.
- `QuizSummary.svelte` — passed/total and the verses that did not.

### `src/lib/quiz/scope.ts` (new)

The I/O half, kept out of `session.ts` so the rule stays testable without a
database.

```ts
export type Target =
  | { kind: 'event'; id: string; label: string; ranges: { packageId: string; verseNos: number[] }[] }
  | { kind: 'package'; id: string; label: string };

/** The 대상 the picker offers: active 암송 DAYs first, then installed packages. */
export function listTargets(today: string): Promise<Target[]>;

/** A 대상's verses and their ratings, both keyed by `${packageId}:${verseNo}`. */
export function resolveTarget(target: Target): Promise<{
  items: QuizItem[];
  ratings: Map<string, { start: DifficultyLevel | null; full: DifficultyLevel | null }>;
}>;
```

`resolveTarget` reads verses with `listVerses()`, **not** `loadPackageData()`.
The latter calls `installPackage()` on a miss, and installing a package as a
side effect of listing quiz scopes is the exact fault a previous commit fixed
on the home screen. Ranges whose package is not installed are skipped, the way
`buildEventCards` already skips them.

### `src/routes/quiz/+page.svelte` (new)

Holds the three states and the session's live values. Calls `resolveTarget`
once when a scope is picked, not per round.

### `src/routes/+page.svelte`

An entry card for the quiz.

**Not on the event card.** `EventSection.svelte` is being changed on the
unmerged `feat/listen-all` branch; putting the entry there buys a conflict for
no benefit, since the picker can preselect an active 암송 DAY anyway.

## Data flow

```
/quiz 설정
  └─ activeEvents() + buildEventCards()   ← 대상, ranges already resolved
       └─ verseRatings for that 대상       ← one read, not one per round
            └─ buildQueue(items, tiers, ratings)   ← pure; Phase C's seam

라운드 제출
  └─ accuracyOf(verse, typed) >= 1        ← pass
  └─ markMismatchedWords(verse, typed)    ← the marks, and the missed indices
       └─ recordCheck(..., { start: null, full: null, missed, source: 'quiz' })

마지막 라운드
  └─ summarize(results)
```

## Error handling

`buildQueue` and `summarize` are total: an empty item list, an empty tier set
and a ratings map with no entry for a verse all produce a defined answer
rather than an error.

If `recordCheck` rejects, the round still advances and the session still
reports its result — the reader is mid-quiz, and stopping them to report a
storage failure trades their session for information they cannot act on. The
loss is one record's worth of future scheduling evidence.

If the scope's data fails to load, the picker shows nothing selectable and
시작 stays disabled, which is the same state as an empty selection.

## Testing

`tests/unit/session.test.ts`
- Tier filter: a verse in a selected tier is served, one outside it is not
- An unrated verse belongs to 미평가 and is served when that chip is on,
  dropped when it is off
- `hardestLevel` semantics survive: a verse rated 2/5 filters as Hard, not
  xEasy — the harder rating decides
- Empty items, empty tier set, ratings map missing a verse → empty queue, no
  throw
- Order is the order the items arrived in, not re-sorted
- `summarize` counts passes and lists only the failed ids
- Two packages contributing the same verse number are kept apart: each takes
  its own rating and only the failed one appears in the summary

`tests/unit/typing.test.ts`
- Enter while composing does not submit
- Shift+Enter does not submit
- Plain Enter submits

`tests/unit/checkHistory.test.ts` (extend)
- `source: 'quiz'` round-trips; a 점검 record reads back without the field
- `suggestedMarks` counts a quiz record's misses

`tests/unit/quizScope.test.ts`
- An event spanning two packages yields items from both, in range order
- A range whose package is not installed is skipped, not thrown on
- Ratings come back keyed by `${packageId}:${verseNo}`, and two packages'
  verse 1 do not collide
- Listing targets does not install anything: a package absent from the db is
  still absent afterwards

`tests/unit/QuizTypingRound.test.ts`
- An exact attempt passes; a one-word slip fails and marks that word
- Submitting reports the missed indices and the elapsed time

`tests/unit/QuizScopePicker.test.ts`
- Zero resolved verses disables 시작 and says why
- The resolved count is shown, and moves when a difficulty chip is toggled

**No route-level test.** This repo has no precedent for rendering a
`+page.svelte` in vitest — every test is a lib module or a component — and
inventing one for this feature would test the harness as much as the page. The
route stays thin enough that everything worth asserting lives in the three
components and the two pure modules; the run through it is covered by the
manual verification below.

`MemorizeCheckPanel` keeps its existing tests green through the `typing.ts`
extraction — the extraction is a refactor, not a behavior change.

## Manual verification

The route's own wiring has no unit test, so it is walked once in a browser:

1. Home shows the quiz entry; it opens `/quiz`.
2. The picker lists the active 암송 DAY and the installed packages, with a
   verse count that changes as difficulty chips are toggled.
3. Start a scope of two or three verses. Type one exactly → pass. Type one
   with a single word wrong → that word is marked, and the round advances.
4. The summary reports the right counts and names the failed verse.
5. `checkHistory` in IndexedDB holds one new row per round, each with
   `source: 'quiz'`, `start: null`, `full: null`, and a `missed` array.
6. The verse card's 지난 점검 list does **not** show those rounds, while the
   같은 verse's 밑줄 mode does dot a word missed twice across them.

Step 6 is the one that proves the two consumers really diverge; the rest can
pass with the filter wired to the wrong side.

## Delivery

Branch `feat/quiz-session`, cut from `main`, in its own git worktree at
`.claude/worktrees/quiz-session`. Concurrent sessions share this repo's main
working tree, so implementation must not `git checkout` there.
