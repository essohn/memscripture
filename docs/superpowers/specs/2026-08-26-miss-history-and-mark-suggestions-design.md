# Miss History and Mark Suggestions — Design

**Status:** Approved (2026-08-26) · single-phase delivery. Phase 1 of two;
the quiz games and their scheduling are a separate spec.

## Problem

The reader underlines the words they keep tripping over. `VerseCard`'s
marking mode says so outright: **"자주 틀리는 단어를 눌러 밑줄"**. But which
words those are is left entirely to memory, and memory is exactly the faculty
under test — the words most worth underlining are the ones the reader is
least likely to recall having missed.

Meanwhile the app already knows. Every 점검 computes
`markMismatchedWords(verse, typed)` in `MemorizeCheckPanel.svelte`, which
returns per-word `{word, ok}` for the whole verse. That answer is rendered
once, then discarded: `recordCheck()` stores `accuracy`, `elapsedMs` and
`hints`, and nothing about *where* the attempt went wrong.

This spec keeps that answer and uses it to propose underlines.

## Non-Goals

- **A statistics screen.** No per-word tables, no charts, no new route. The
  dotted suggestion in the verse is the whole face of this data. A screen
  that reports "you miss 인자 62% of the time" tells the reader something
  they cannot act on in the place where they would act on it.
- **Deciding for the reader.** Suggestions are never applied automatically.
  See "Why suggestions are not stored" below.
- **Remembering rejections.** There is no dismiss action and no
  "I don't want this one" flag. See "Rejection" below.
- **Quiz priority and scheduling.** Phase 2 reads the same records; nothing
  here anticipates it beyond leaving the data in a shape it can use.
- **Changing the grading rules.** `markMismatchedWords` is used exactly as it
  already is. If its notion of a missed word is wrong, that is a grading bug
  and belongs in `grade.ts`, not here.

## User-facing behavior

Nothing changes until the reader opens marking mode.

In 연습 (curtain) mode, tapping **밑줄** already opens the whole verse and
turns every word into a tap target. From now on, the words this reader has
repeatedly missed arrive already marked out — with a **dotted** underline,
visibly different from the solid one that means "I underlined this".

Tapping a dotted word makes it a real underline. Tapping it again removes it,
exactly as today. A suggestion the reader ignores stays dotted and costs
nothing.

The mode's hint line changes only when there is something to say:

| Condition | Hint line |
|---|---|
| A suggestion is dotted and not yet taken | 자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄 |
| None, or every one has been taken | 자주 틀리는 단어를 눌러 밑줄 *(unchanged)* |

Suggestions do not appear in read mode, in the curtain before 밑줄 is
pressed, or in the 점검 panel. Marking mode is where underlines are decided,
and it is the only place where a suggestion has an action attached to it. A
dotted underline in read mode would be a remark with nothing to do about it,
competing for attention with the reader's own marks during recitation.

## Rule

A word is suggested when it was missed **at least 2 times in the last 5
recorded checks** of that verse, and it is among the **3 most-missed** words
of that verse.

```
SUGGEST_WINDOW        = 5   // how many recent checks are consulted
SUGGEST_MIN_MISSES    = 2   // how many misses inside that window suggest
SUGGEST_MAX_PER_VERSE = 3   // how many spots a verse may propose at once
```

All three are exported constants, tunable without touching the logic.

One slip does not earn a suggestion — typos and a bad morning are not a weak
spot. And the rule decays on its own: as the reader improves, clean checks
push the old misses out of the five-check window and the suggestion
disappears without anything having to expire it.

### Why there is a cap

`markMismatchedWords` walks the verse forward and stops matching at the point
the attempt ran out. An attempt the reader gave up on and submitted half-typed
therefore reports **the entire tail of the verse as missed**. Two of those and
an uncapped rule would dot twenty words at once — which is not a hint about a
spot, it is the verse highlighted.

Ranking by miss count and keeping the top three fixes this in the right
direction rather than by discarding records: for a give-up the top three are
the words right where the reader stalled, which is exactly the useful answer.
Ties break toward the earlier position, so a verse proposes the places you
reach first.

Three is deliberately narrower than what the reader can mark by hand. The
suggestion is a nudge toward a spot; the marking is theirs and stays
unbounded.

### Records that measure less than they seem to

Two cases are counted as they are, with no special handling:

- **Records written before this feature** have no `missed` field. They **fill
  the window but contribute no misses** — silent, not clean. Counting an
  unmeasured check as a success would let old records suppress suggestions the
  new ones earn.
- **Assisted checks** (힌트 pressed, or the verse heard aloud) under-report: a
  word revealed by a hint and then typed correctly reads as produced. This is
  not merely a delayed suggestion, as an earlier draft of this spec claimed. A
  clean assisted check writes `missed: []`, indistinguishable from unaided
  perfection, and it occupies a slot in the five-check window — so it can push
  a real miss out and *retract* a suggestion the reader earned, from the reader
  least able to do without it. That is the failure `ASSISTED_CEILING` in
  `grade.ts` exists to prevent elsewhere: a verse recited with the words in
  front of you is a verse you have not recited.

  It is counted as it is regardless, for now. Excluding assisted checks from
  the tally would change nothing — a clean assisted record already contributes
  no misses — so the fix would have to exclude them from the *window*, and that
  freezes the window for a reader who always reaches for a hint: their old
  misses would never decay and the suggestion would never leave. Which cost is
  worse is a question for use rather than for this document. Note also that
  `heardAloud` is never persisted, so half of the assistance cannot be
  recovered after the fact. **Open.**

## Data

One optional field on the existing record:

```ts
// src/lib/db/local.ts — CheckRecord
/** Word positions the attempt got wrong, as markMismatchedWords saw them.
 *  Optional: records written before this existed have none, and absent is
 *  not the same as an empty array — the same distinction `hints` makes. */
missed?: number[];
```

**No Dexie version bump.** Dexie persists whole objects; the `stores()`
declaration defines indexes, not shape. `missed` is not indexed, so v8 stands
and there is no migration.

**No sync change.** `merge.ts:103` merges `checkHistory` with `unionById`,
which carries whole records. A new field rides along.

**No new table.** The alternative — a per-word cumulative counter table —
would need a schema version, its own merge rule, a decay policy so that
misses from May stop mattering, and a story for what happens when an OYO
verse is edited underneath it. All four are avoided by deriving from the
records that already exist. `listPerfectVerseNos()` made the same call for
the same reason, and its comment states it: a second copy of a fact can
disagree with the first.

### Why suggestions are not stored

A suggestion is a function of the last five checks and nothing else. Computing
it on read means it cannot go stale, cannot disagree with the history it came
from, and cannot survive the reader getting better at the verse.

This also disposes of the OYO problem. OYO verses are editable, so a stored
word index can slide onto a different word after an edit — the failure
`activeMarks()` exists to prevent, because *an underline on the wrong word is
worse than none: it tells the reader to watch a place they never missed*.

Suggestions carry an index without the word text, so they cannot be validated
the same way. They do not need to be:

- Out-of-range indices are dropped (`i < wordCount`).
- An in-range index that has drifted onto the wrong word produces a dotted word
  the reader does not tap. A word inserted at the front shifts every index, so
  the drift can be all three suggestions at once rather than one. They clear as
  the checks that placed them leave the window — with `SUGGEST_MIN_MISSES = 2`
  in a five-check window that is four clean checks, not one.
- Nothing is written, so nothing wrong persists.

Storing `{i, w}` pairs instead would make validation possible at a real cost —
900 verses × 10 records × several missed words each, carried in every sync
snapshot — to prevent a transient cosmetic slip on hand-edited verses only.

### Rejection

There is no way to dismiss a suggestion, and none is needed. A dotted mark is
quiet, it appears only inside a mode the reader opened on purpose, and
ignoring it has no consequence. If the reader disagrees with it, they stop
missing the word and it leaves on its own — not on the next check, but over
the same four clean checks "Why suggestions are not stored" describes for a
drifted index, since it is the identical window arithmetic doing the clearing
either way.

Storing rejections would mean a new table, a decision about whether a
rejection expires, and a second reason a suggestion might be absent — making
"why is this not suggested?" unanswerable from the history alone.

## Components

### `src/lib/memorize/missStats.ts` (new)

The whole of the new logic. Pure, no I/O.

```ts
export const SUGGEST_WINDOW = 5;
export const SUGGEST_MIN_MISSES = 2;
export const SUGGEST_MAX_PER_VERSE = 3;

/** Word indices repeatedly missed in the recent window.
 *  `history` is most-recent-first, as listChecks() returns it. */
export function suggestedMarks(
  history: Pick<CheckRecord, 'missed'>[],
  wordCount: number
): Set<number>;
```

Takes the first `SUGGEST_WINDOW` entries, tallies indices across those with a
`missed` array, keeps indices with `>= SUGGEST_MIN_MISSES` that are `<
wordCount`, then keeps the `SUGGEST_MAX_PER_VERSE` highest tallies, breaking
ties toward the lower index.

Duplicate indices inside one record count once — a record describes one
attempt, and `markMismatchedWords` returns one entry per word position, so a
repeat would be a caller bug rather than two misses.

### `src/lib/db/checkHistory.ts`

One change: `recordCheck()` accepts `missed?: number[]` in its entry object
and stores it unchanged.

There is **no package-wide suggestion query**. `VerseCard` already owns the
check history for its own verse and already loads it lazily; see below.

### `src/lib/components/card/MemorizeCheckPanel.svelte`

`mismatches` is already derived at `:201`. A `missedIndices()` helper turns it
into the positions to report, off the same marking the panel already paints,
so the stored history and the screen can never disagree about one attempt:

```ts
function missedIndices(): number[] {
  return mismatches.flatMap((m, i) => (m.ok ? [] : [i]));
}
```

It has two call sites, because there are two ways a check ends. `submit()`
calls it directly when the attempt is flawless, the one path that skips the
confirmation dialog — and its `[]` is meaningful, not incidental: it is the
evidence that pushes an older miss out of the window. Anything short of
flawless instead sets `proposed` and waits on the reader; `save()`, behind
that confirmation dialog, is where `missedIndices()` is called for those
attempts. 포기 (`giveUp()`) also lands on `save()` rather than bypassing it,
which is the only reason a give-up produces a `missed` record at all — and
"Why there is a cap" above depends on that record existing.

`onGraded`'s prop type gains `missed: number[]`.

### `src/lib/components/card/VerseCard.svelte`

The card computes its own suggestions. No new prop, and no route changes.

`checkHistory` is already `$state` on this card, and `enterCheck()` already
loads it lazily rather than on every card render — a 900-row list must not
issue 900 queries for history nobody opened. Marking mode gets the same
treatment, so the load is extracted into one function all three callers share:

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
```

Three callers, not two: `enterCheck()` in place of its inline query,
`toggleMarking()` when turning marking on, and the `onGraded` handler that
refreshes the history after a check is recorded. That third one was a
duplicate of the same query, which is exactly what the extraction exists to
prevent.

```ts
/** Words this reader keeps missing. Derived, never stored — see the spec's
 *  "Why suggestions are not stored". Empty outside marking mode because a
 *  suggestion the reader cannot act on is just noise. */
const suggested = $derived(
  marking ? suggestedMarks(checkHistory, totalWords) : new Set<number>()
);
```

```svelte
class:suggested={suggested.has(i) && !marked.has(i)}
```

Styled as a dotted underline in `--color-text-tertiary`, clearly subordinate
to the solid `underlined`. No new tap handling — marking mode already binds
`onToggleMark(i, word)` to every word, so a suggestion becomes a real mark
through the existing path.

The hint line gains the branch in the table above. It speaks off a second
derivation rather than off `suggested` itself:

```ts
const hasOpenSuggestion = $derived([...suggested].some((i) => !marked.has(i)));
```

Once the reader has underlined every word that was dotted, nothing on screen
is dotted any more, and a line still telling them to press the dots would be
describing a screen that is gone.

**Why the card and not the route.** The marks the card renders arrive as a
prop because the route bulk-loads them for the whole list — but that is a
scan of rows that *exist only where the reader marked something*. Check
history is up to ten rows per checked verse, so the equivalent package scan
would read thousands of rows on every list open to answer a question the
reader asks on one verse, occasionally. Owning it in the card also means every
screen that renders a `VerseCard` — the package list and the verse detail
route — gets suggestions with no plumbing.

## Data flow

```
점검 submit
  └─ markMismatchedWords(verse, typed)   ← already computed for display
       └─ missed: number[]
            └─ onGraded → recordCheck → checkHistory.missed

밑줄 pressed
  └─ loadCheckHistory()                  ← one indexed query, this verse only
       └─ suggestedMarks(recent 5, totalWords)   ← pure, $derived
            └─ dotted words
                 └─ tap → onToggleMark → verseMarks   ← existing path
```

## Error handling

There is nothing to fail. `suggestedMarks` is total: an empty history, a
history of records without `missed`, a `wordCount` of zero and out-of-range
indices all produce an empty set rather than an error.

If the history query rejects, `loadCheckHistory` swallows it exactly as
`enterCheck` does today and `checkHistory` stays as it was — so marking mode
works exactly as it does now, with no suggestions. A suggestion is an
enhancement to a working feature, so its absence is a degraded view, never a
blocked one.

## Testing

`tests/unit/missStats.test.ts`

- No history → empty
- Window boundary: a miss in the 6th-most-recent record is not counted
- Threshold boundary: one miss does not suggest, two do
- Cap: a give-up record repeated twice yields 3 suggestions, and they are the
  words where the attempt stalled
- Cap ties break toward the lower index
- Records without `missed` fill the window without contributing misses
- Out-of-range indices are dropped
- A duplicate index inside one record counts once
- `wordCount` of 0 → empty

`tests/unit/checkHistory.test.ts` (extend)

- `missed` survives a write/read round trip
- A flawless check stores `[]`, not `undefined`
- A record written without `missed` reads back without it, so the field stays
  distinguishable from an empty array

Component coverage

- `VerseCard.suggest.test.ts` (new file — it needs `fake-indexeddb`, which
  `VerseCard.memorize.test.ts` deliberately does without): pressing 밑줄 loads
  the history and dots the repeatedly-missed words; a dotted word is not
  dotted once really marked; read mode and the un-pressed curtain show no dots
- `MemorizeCheckPanel.test.ts`: a graded submit reports the missed indices,
  and a flawless one reports `[]`

The existing suite must stay green: 1040 tests across 76 files on this branch.

## Delivery

Branch `feat/miss-history`, cut from `main`. `feat/listen-all` is unmerged and
touches the player and home section; nothing here overlaps it.
