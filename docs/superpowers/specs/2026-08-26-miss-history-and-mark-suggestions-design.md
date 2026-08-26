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
`markMismatchedWords(verse, typed)` (`MemorizeCheckPanel.svelte:200`), which
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
| Suggestions present | 자주 틀린 곳을 점선으로 표시했습니다 · 눌러서 밑줄 |
| None | 자주 틀리는 단어를 눌러 밑줄 *(unchanged)* |

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
- **Assisted checks** (힌트 pressed, or the verse heard aloud) under-report:
  a word revealed by a hint and then typed correctly reads as produced. The
  effect is conservative — a hinted check can only lower a word's miss count,
  never invent one — so it delays a suggestion rather than fabricating it.
  `fullDifficultyFrom` already penalizes assistance in the rating; penalizing
  it a second time here would double-count the same moment.

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
- An in-range index that has drifted onto the wrong word produces one dotted
  word that the reader does not tap, and it is gone at the next check.
- Nothing is written, so nothing wrong persists.

Storing `{i, w}` pairs instead would make validation possible at a real cost —
900 verses × 10 records × several missed words each, carried in every sync
snapshot — to prevent a transient cosmetic slip on hand-edited verses only.

### Rejection

There is no way to dismiss a suggestion, and none is needed. A dotted mark is
quiet, it appears only inside a mode the reader opened on purpose, and
ignoring it has no consequence. If the reader disagrees with it, they stop
missing the word and it leaves on its own.

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

Two changes.

`recordCheck()` accepts `missed?: number[]` in its entry object and stores it
unchanged.

```ts
/** Suggestions for a whole package, keyed by verse number.
 *  One range scan on the verseKey index — the same shape as
 *  listPerfectVerseNos, because 900 verses must not mean 900 queries. */
export async function listMissSuggestions(
  packageId: string,
  wordCounts: Map<number, number>
): Promise<Map<number, Set<number>>>;
```

Groups the package's records by verse, sorts each group most-recent-first,
and runs `suggestedMarks` per verse using that verse's word count. Verses with
no suggestions are absent from the map rather than present with an empty set,
so the caller can treat presence as meaning something — the same convention
`listMarksForPackage` uses for empty mark rows.

### `src/lib/components/card/MemorizeCheckPanel.svelte`

`mismatches` is already derived at `:200`. The submit path adds the missed
indices to what it reports:

```ts
const missed = mismatches.flatMap((m, i) => (m.ok ? [] : [i]));
onGraded({ ...result, accuracy, elapsedMs, hints: hintsUsed, missed });
```

A flawless attempt reports `[]`, which is meaningful and must be stored: it is
the evidence that pushes an older miss out of the window.

`onGraded`'s prop type gains `missed: number[]`.

### `src/lib/components/card/VerseCard.svelte`

One new prop and one class:

```ts
/** Word indices proposed from the check history. Rendered only in marking
 *  mode: a suggestion the reader cannot act on is just noise. */
suggested?: Set<number>;
```

```svelte
class:suggested={marking && suggested?.has(i) && !marked.has(i)}
```

Styled as a dotted underline in `--color-text-tertiary`, clearly subordinate
to the solid `underlined`. No new tap handling — marking mode already binds
`onToggleMark(i, word)` to every word, so a suggestion becomes a real mark
through the existing path.

The hint line at `:821` gains the branch in the table above.

### `src/routes/library/[packageId]/+page.svelte`

`:236` already loads `listMarksForPackage(currentPackageId)` in a batch.
`listMissSuggestions(currentPackageId, wordCounts)` joins it, and the result
is passed down per card. Word counts come from the verses already loaded for
the list.

The verse detail route (`[packageId]/[verseNo]`) gets the same treatment for
its single verse.

## Data flow

```
점검 submit
  └─ markMismatchedWords(verse, typed)   ← already computed for display
       └─ missed: number[]
            └─ onGraded → recordCheck → checkHistory.missed

밑줄 mode open
  └─ listMissSuggestions(packageId, wordCounts)   ← one range scan
       └─ suggestedMarks(recent 5, wordCount)     ← pure
            └─ VerseCard suggested → dotted words
                 └─ tap → onToggleMark → verseMarks   ← existing path
```

## Error handling

There is nothing to fail. `suggestedMarks` is total: an empty history, a
history of records without `missed`, a `wordCount` of zero and out-of-range
indices all produce an empty set rather than an error.

If `listMissSuggestions` rejects, the page's existing load handling applies
and the card renders with no suggestions — marking mode works exactly as it
does today. A suggestion is an enhancement to a working feature, so its
absence is a degraded view, never a blocked one.

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
- `listMissSuggestions` returns one entry per qualifying verse and omits the
  rest
- Verses from other packages do not leak into the scan

Component coverage

- `VerseCard`: a suggested word renders dotted in marking mode, renders
  nothing in read mode, and is not dotted once it is really marked
- `MemorizeCheckPanel`: a graded submit reports the missed indices, and a
  flawless one reports `[]`

The existing suite (1103 tests) must stay green.

## Delivery

Branch `feat/miss-history`, cut from `main`. `feat/listen-all` is unmerged and
touches the player and home section; nothing here overlaps it.
