# Quiz Games — Design

**Status:** Approved (2026-08-27) · Phase B of three.
Phase A built the session, the scope picker and the typing round. Phase C
adds priority scheduling and replaces `buildQueue`.

**Depends on:** `2026-08-27-quiz-session-design.md` — this adds two round
types to that session and widens the `source` field it introduced.

## Problem

The quiz has one game: type the whole verse. That tests the one thing, in the
one way, and it is the hardest of the three the reader asked for. Two gaps:

- A verse can be known but hard to *start*. Nothing practises the opening on
  its own, even though the app already measures 첫 시작 난이도 separately from
  전체 암송 난이도 and already knows when a reader has produced an opening.
- Phase 1 records which words a reader keeps getting wrong, and Phase A's
  suggestions use that to underline them. Nothing yet turns it around and asks
  the reader to *find* the mistake — recognition rather than recall.

This spec adds both games and a way to choose between the three.

## Non-Goals

- **Choosing a game per verse automatically.** "This verse's opening is weak,
  so quiz its opening" needs the same signals Phase C's scheduling will
  compute; building them twice is waste. The reader chooses one game per
  session. Phase C may make it automatic.
- **Synthesising a wrong verse.** No 조사 swaps, no substituted words, no
  deliberate corruption of a correct verse. The spot-the-error game shows the
  reader's own recorded attempt or nothing. See "Why the mistake is not
  invented".
- **Priority or repetition.** Still Phase C. `buildQueue` is untouched by this
  spec.
- **Grading speech.** The first-words game is typed. `speech.ts` states why
  dictation never feeds the grader: recognition is trained on modern Korean
  and the corpus is 개역한글, so a clean recitation comes back misheard often
  enough that scoring it would mark a reader down for the recognizer's
  mistakes.

## User-facing behavior

### Choosing a game

`QuizScopePicker` gains a third section, above 시작:

| Chip | What it asks |
|---|---|
| 전체 타이핑 | Type the whole verse from memory *(Phase A, unchanged)* |
| 첫 단어 | Just get the verse started |
| 틀린 곳 찾기 | Here is a verse — is anything wrong with it, and where? |

One game for the whole session. `onStart` carries it to the route, which
renders the matching round.

`buildQueue` is **not** given the game. Which verses a scope serves is a
separate question from which screen they are asked on, and that function is
the seam Phase C replaces — widening it here would mean Phase C has to
disentangle two concerns instead of replacing one.

### 첫 단어

The cue is the title and the citation, as in the typing round; the body is
hidden. The reader types.

**The round grades itself the moment the opening matches** — there is no 제출
button. The point of this game is getting going, and hunting for a button after
two words erases it. `모르겠어요` reveals the opening and records a failure.

Grading is automatic; **leaving is not**. The verdict appears and 다음 advances,
the same two steps the typing round settled on — a round that both graded and
unmounted itself would flash past before the reader saw whether they were
right, and could not honour "reports exactly once".

"The opening" is `hasTypedOpening()` in `src/lib/memorize/timing.ts`, exactly
as it stands: `OPENING_WORDS = 2`, compared under the grading normalization so
spacing never holds it open, with a short-verse fallback so a two-word verse
can still be finished. Its comment already argues the number:

> Two words, deliberately — this no longer borrows extractFirstClause, which
> yields 3–8 words for the daily review card's cue. That is the right size for
> a *hint*, but the wrong size for this clock: by the second word the reader
> has plainly recalled how the verse starts, and waiting for up to eight
> turned 첫 시작 난이도 into a measure of typing speed on long verses.

The reader asked for "the first 2-3 words". The app has already decided, with
a reason, that the number is two. A second definition of "has started this
verse" inside one app is worse than either number.

### 틀린 곳 찾기

The round shows a verse and asks two questions at once: is anything wrong, and
if so where.

- If the reader has a **recorded attempt** for that verse, the round shows
  that attempt — the sentence they actually typed.
- If not, it shows the **correct verse**, and 이상 없음 is the right answer.

The reader presses 이상 있음 or 이상 없음. Either ends the round.

**The picker says how many real questions a scope holds** — `12구절 중 5개에
내 오답 기록이 있습니다` — because early on most verses have none, and without
that line the winning strategy is to press 이상 없음 every time. The count is
read only when this game is selected.

### Why the mistake is not invented

The obvious alternative is to corrupt a correct verse — swap 을 for 를, or
substitute a word. It is rejected here.

A synthesised error tests whether the reader can spot *an* anomaly. The
reader's own recorded attempt tests whether they can spot *the* place they
personally go wrong, which is the whole reason Phase 1 started recording. A
generated 조사 swap is a puzzle; their own sentence is a mirror.

The cost is honest and was accepted: until attempts accumulate, most rounds
are 이상 없음, and the picker's count says so rather than hiding it.

### Three consequences worth stating here

*(The first has since been reversed; it is kept, struck through, with the
reasoning that replaced it.)*

Accepted along with the design above, and better read here than discovered
later in the code:

- **~~An omitted word is a question 틀린 곳 찾기 cannot ask.~~** *Reversed
  after release — see below.* A word that is missing has no "does not
  belong" to tap, and this spec accepted that as a gap in what the game
  knows how to ask rather than a grading error in what it does ask. That
  was the wrong call: the round still asked "is anything wrong", and still
  answered "no" about a sentence that was wrong. Grading a reader correct
  for missing the flaw is a grading error whatever the flaw's shape.

  The fix adds 이상 있음 beside 이상 없음, and asks the difference in both
  directions (`findSpotFlaws` in `src/lib/quiz/spot.ts`): which shown words
  do not belong, *and* which of the verse's words the sentence dropped.
  The verdict is the whole answer, and naming the word was dropped with it:
  a reader who sees the sentence is off has recognised the flaw, which is
  what this game tests, and requiring them to also point at the word asked
  a second and harder question on top of the first — one that a dropped
  word made unanswerable. The words stay on screen as the question and are
  marked afterwards as the answer; they are not the input. A round whose
  flaw was only an omission shows the verse with the dropped words marked,
  because marking the mistake in place is impossible when the mistake is
  an absence.

- **`typed` carries more into every sync snapshot than the alternative this
  spec turned down.** "What is stored, and what is not" rejected storing
  `{i, w}` pairs specifically to avoid carrying word text for 900 verses
  through every snapshot. Whole sentences — up to ten per verse — are
  strictly more text than that would have been. The reversal is deliberate,
  not an oversight: a pair could only ever name the words `missed` already
  indexed, and the whole point of this game is handing back the sentence as
  it was actually typed, which a partial sentence cannot do.

- **A synced `quiz-opening` row can light a stale badge on an older build.**
  A device running a build from before `countsAsRecall` existed reads every
  row as recall regardless of `source`. A perfect opening round synced in
  from a newer device will light that device's 만점 배지, and its
  `missed: []` dilutes its suggestion window. No corruption — the record is
  exactly what it says it is — and it self-heals the moment that device
  updates.

## Data

### What is stored, and what is not

Phase 1 stores `missed` as **indices only** — which positions went wrong, not
what was written instead. That was deliberate (storing `{i, w}` pairs would
have carried word text for 900 verses through every sync snapshot), and it
means the reader's actual mistake cannot be reconstructed after the fact.

Recovering it from `missed` is not available either. `markMismatchedWords`
walks the expected words forward and reports which were not produced; it never
pairs a missed word with whatever took its place. Pairing them needs an
alignment, and `grade.ts` records why this codebase abandoned one:

> This replaced an edit-distance backtrace. That aligned on the same character
> stream the score uses, which sounded right, but its answer depended on which
> minimum-cost path it happened to walk — ties are common, and two readings of
> the same attempt could disagree about a word the reader plainly typed. It
> was patched once for that and reported again.

So the attempt is stored going forward, whole.

```ts
// src/lib/db/local.ts — CheckRecord
/** What the reader actually typed. Kept only for attempts that nearly
 *  landed: a verse abandoned after two words is not a question anybody can
 *  answer, and the whole point of keeping it is to hand it back later and
 *  ask "what is wrong here?". */
typed?: string;
```

**No Dexie version bump, no sync change** — `typed` is not an index, and
`merge.ts` unions whole `checkHistory` rows. Same reasoning as `missed` and
`source` before it.

**Stored when** `accuracy >= RECALLABLE_MIN_ACCURACY` (0.9) **and** the
attempt was not perfect. A perfect attempt has nothing wrong to find; a
collapsed one is not a spot-the-difference question. The constant is exported
and tunable.

### Grading a tap

Nothing about which words are wrong is stored. At round time:

```ts
markMismatchedWords(shownText, verse.w)
```

— the arguments reversed, which is the call `MemorizeCheckPanel` already makes
at `:203` to mark the reader's own words. It returns which words of the
*shown* text do not belong. `findSpotFlaws` (`src/lib/quiz/spot.ts`) runs it
in both directions — the second pass names the verse's words the sentence
dropped — and 이상 있음 is right when either list has anything in it.

Deriving this rather than storing it is the same rule Phase 1 set for
suggestions: a second copy of a fact can disagree with the first.

### `source` widens to three

Each game proves something different. Passing on two words does not mean the
verse is known; spotting a planted error is recognition, not recall. Writing
all three as `'quiz'` would light the 만점 badge for typing two words.

```ts
source?: 'quiz' | 'quiz-opening' | 'quiz-spot';
```

Absent still means 점검.

| Reader | 점검 | quiz | quiz-opening | quiz-spot |
|---|---|---|---|---|
| 밑줄 제안 (`suggestedMarks`) | ✓ | ✓ | ✗ | ✗ |
| The card's 지난 점검 list | ✓ | ✗ | ✗ | ✗ |
| 만점 배지 (`listPerfectVerseNos`) | ✓ | ✓ | ✗ | ✗ |
| Phase C scheduling | ✓ | ✓ | ✓ | ✓ |

**This changes Phase A behavior.** Today the suggestions and the badge read
every row without looking at `source`, which was right when `'quiz'` was the
only value. Both must narrow to `!r.source || r.source === 'quiz'`.

The opening and spot rounds write no `missed` — neither produces word-level
evidence about recall — so they cannot affect suggestions even by accident.

## Components

### `src/lib/quiz/session.ts`

`RoundResult` gains one optional field:

```ts
	/** What the reader typed, when this game produced a sentence worth
	 *  keeping. Only the typing round sets it; recordCheck decides whether it
	 *  is kept, so no round needs to know the threshold. */
	typed?: string;
```

Optional because two of the three games have nothing to put there: the opening
round produces a fragment, and the spot round produces a tap.

### `src/lib/quiz/games.ts` (new)

Pure. The three games as data, so the picker, the route and the recorder all
name them the same way.

```ts
export type Game = 'typing' | 'opening' | 'spot';

/** The label each chip shows. */
export const GAME_LABELS: Record<Game, string>;

/** What a round of this game writes as its record's source. */
export const GAME_SOURCE: Record<Game, 'quiz' | 'quiz-opening' | 'quiz-spot'>;

/** Kept only for attempts that nearly landed — see "What is stored". */
export const RECALLABLE_MIN_ACCURACY = 0.9;

/** Whether this attempt is worth keeping as a future 틀린 곳 찾기 question. */
export function isRecallableAttempt(accuracy: number): boolean;
```

### `src/lib/quiz/scope.ts`

One function added, called only when 틀린 곳 찾기 is chosen:

```ts
/** Per verse, the `typed` of its most recent record that has one — not of
 *  its most recent record, which may well be a later clean check. Keyed by
 *  QuizItem.id; verses with no stored attempt are absent, so the picker can
 *  count the map's size to say how many real questions a scope holds. */
export function loadAttempts(items: QuizItem[]): Promise<Map<string, string>>;
```

`resolveTarget` is unchanged. Attempts are a second, optional read rather than
a widening of the first, because two of the three games never need them.

### `src/lib/components/quiz/QuizOpeningRound.svelte` (new)

Props `{ item, index, total, onDone }`, matching the typing round so the route
treats them alike.

Passes the instant `hasTypedOpening(item.w, typed)` is true. `모르겠어요`
reveals the opening and fails. Reports exactly once, guarded the way the
typing round is — the same double-tap defect applies to any round the route
advances off.

`RoundResult.missed` is `[]` and `accuracy` is 1 on a pass, 0 on a failure.
Neither reaches the suggestions or the badge, because `quiz-opening` is
excluded from both.

### `src/lib/components/quiz/QuizSpotRound.svelte` (new)

Props `{ item, shown, index, total, onDone }` — `shown` is the text to
display, which the route supplies from `loadAttempts` or falls back to
`item.w`.

Renders `shown` word by word as plain text, plus 이상 있음 and 이상 없음.
After the answer it marks the wrong words — or, when the flaw was an
omission, shows the verse with the dropped words marked — and says whether
the reader found it. Reports once.

`accuracy` is 1 when the answer was right, 0 otherwise; `missed` is `[]`.

**`accuracy` on these two rounds is a verdict, not a measurement.** A 1 from a
spot round means "found it", and a 1 from an opening round means "started it" —
neither means the verse was recited. Nothing in this phase reads them as
accuracy, because both sources are excluded from the suggestions and the badge;
Phase C is the first reader that will see them and must not average them
against a 점검's.

### `src/lib/components/quiz/QuizScopePicker.svelte`

A 게임 section of three chips, single-select, defaulting to 전체 타이핑.
`onStart(queue, game)`.

When 틀린 곳 찾기 is selected the picker loads attempts for the resolved items
and shows `{total}구절 중 {n}개에 내 오답 기록이 있습니다`. The other two games
show nothing extra.

### `src/routes/quiz/+page.svelte`

Holds the chosen game and the attempts map. Renders the matching round inside
the existing `{#key}`, and records with `GAME_SOURCE[game]`.

### `src/lib/components/card/MemorizeCheckPanel.svelte`

`onGraded`'s outcome gains `typed: string`. The panel already holds the text;
`recordCheck` decides whether to keep it, so the panel does not need to know
the threshold.

### `src/lib/db/checkHistory.ts`

`recordCheck` accepts `typed?: string` and stores it only when
`isRecallableAttempt(accuracy)` and `accuracy < 1`. Storing the decision here
rather than at each call site means the quiz's typing round and the card's
check cannot disagree about what is worth keeping.

`suggestedMarks`'s callers and `listPerfectVerseNos` narrow to 점검 and
`'quiz'`, per the table above.

## Error handling

`isRecallableAttempt` and `GAME_SOURCE` are total lookups; no input produces an
error.

`loadAttempts` returns an empty map if its read rejects, and the picker then
reports zero real questions — which is the same state as a scope whose verses
have no history, and is honest either way.

A spot round whose verse has no stored attempt is not an error: it shows the
correct verse and 이상 없음 is the answer.

A failed `recordCheck` behaves as Phase A settled it — the run continues, and
the summary counts what could not be stored.

## Testing

`tests/unit/games.test.ts`
- `isRecallableAttempt` at and around the threshold, and that a perfect
  attempt is excluded
- `GAME_SOURCE` maps each game to a distinct source

`tests/unit/checkHistory.test.ts` (extend)
- `typed` is stored for a near-miss and omitted for a collapse
- `typed` is omitted for a perfect attempt
- a record with `source: 'quiz-opening'` does not feed `suggestedMarks`
- a record with `source: 'quiz-spot'` does not light `listPerfectVerseNos`
- `'quiz'` and 점검 still do both

`tests/unit/quizScope.test.ts` (extend)
- `loadAttempts` returns the most recent attempt per verse and omits verses
  with none
- two packages' verse 1 do not collide

`tests/unit/QuizOpeningRound.test.ts`
- typing the first two words passes without a 제출 press
- typing one word does not
- spacing does not decide it
- 모르겠어요 fails and reveals
- the result is reported once even if 다음 is tapped twice

`tests/unit/QuizSpotRound.test.ts`
- tapping the wrong word of a shown attempt is correct
- tapping a correct word is not
- 이상 없음 is correct when the shown text is the verse itself, and wrong when
  it is a flawed attempt
- the result is reported once

`tests/unit/QuizScopePicker.test.ts` (extend)
- selecting a game changes what `onStart` reports
- 틀린 곳 찾기 shows the attempts count; the other games do not

`tests/unit/quizPageAttempts.test.ts`
- a completed opening round records `source: 'quiz-opening'`, a completed
  spot round records `'quiz-spot'`, and the typing round still records
  `'quiz'` — checked against what actually lands in `checkHistory`, not a
  spy on an intermediate call. This is the automated version of Manual
  verification's step 5 below.

The suite must stay green.

## Manual verification

This repo *can* render a `+page.svelte` under vitest — `oyoImportMenu.test.ts`
and `tableImportPage.test.ts` already did before this spec was written, and
`quizPageAttempts.test.ts` above does the same for this route. The walk below
is not standing in for that coverage; it is what the automated tests cannot
see — the actual screens, in a real browser:

1. Pick a scope, choose 첫 단어, start. Typing the first two words advances
   without pressing anything.
2. Choose 틀린 곳 찾기 on a scope with no history: the picker said `0개` and
   시작 was disabled.
3. Run 전체 타이핑 on a verse and get one word wrong. Confirm `typed` is now
   on that record in IndexedDB.
4. Choose 틀린 곳 찾기 again: that verse now shows the sentence just typed, the
   picker's count moved, and tapping the wrong word is correct.
5. The card's 만점 배지 does **not** light from an opening round, and the
   underline suggestions do not move from a spot round.

Step 5 is the one visual confirmation that the `source` widening did what it
claims; `quizPageAttempts.test.ts` proves the same thing at the data layer,
so the rest of this walk is the part that stays manual — it can otherwise
pass with every game writing `'quiz'`.

## Delivery

Branch `feat/quiz-games`, cut from `origin/main`, in its own git worktree at
`.claude/worktrees/quiz-games`. Concurrent sessions share this repo's main
working tree, so implementation must not `git checkout` there.
