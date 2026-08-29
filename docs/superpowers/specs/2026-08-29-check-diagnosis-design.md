# Check Diagnosis — Design

**Status:** Approved (2026-08-29) · single-phase delivery. Reads the records
`2026-08-26-miss-history-and-mark-suggestions-design.md` began storing; adds
no field to them.

## Problem

Every 점검 already leaves behind more than the app spends. `recordCheck()`
files `accuracy`, `elapsedMs`, `hints`, `missed[]` (word positions),
`start`/`full` (the self-assessed difficulty *at that moment*), and `typed`
(the attempt itself). Ten of those rows survive per verse.

Two consumers read them today. `suggestedMarks` turns `missed[]` into dotted
underlines — a binary yes/no over the last five checks. `CheckHistorySheet`
prints the rows as a list. Nothing reads the shape of the pile: whether this
verse is costing more attempts than its neighbours, whether the reader's own
sense of it is improving or sliding, or *where inside the verse* the attempts
keep failing.

The reader's question is "이 구절의 어디가 문제인가". The list answers it only
by making them read ten attempts and do the tallying themselves — which is
the same faculty under test.

## Non-Goals

- **A statistics screen.** No new route, no cross-verse ranking, no global
  per-word table. The earlier spec ruled a stats screen out on the grounds
  that "you miss 인자 62% of the time" is unactionable *in a place the reader
  cannot act on it*. That reasoning stands and this spec obeys it: the
  diagnosis appears inside the sheet the reader opened **about that one
  verse**, printed on that verse's own words, one tap from the marking mode
  that acts on it. What was ruled out was the screen, not the knowledge.
- **A third card mode.** 읽기 and 마킹 stay the only two. `VerseCard` is
  already ~1100 lines and every new mode doubles the state combinations.
- **Replacing the dotted suggestion.** `suggestedMarks` keeps its rule, its
  window, and its place in marking mode untouched. The diagnosis observes;
  the dots propose. Two voices, two rooms.
- **Ranking verses against each other.** "고생 지수 랭킹" is a real idea and a
  different spec — it needs a cross-package scan, a scoring policy, and a
  place to live. This one deliberately reads one verse.
- **Changing grading.** `markMismatchedWords` is consumed exactly as it is.
- **Storing anything.** No new table, no new field, no migration. See
  "Why nothing is stored".

## User-facing behavior

Nothing changes until the reader taps **최근 점검** on a card and the 점검
기록 sheet opens.

Above the list of attempts, and below the title, a read-only summary block
appears:

```
┌ 요 3:16 점검 기록                    ✕ ┐
│                                        │
│  최근 6회 · 힌트 12 · 14분             │
│  정확도  ▁▃▂▅▄▆                        │
│  첫 시작  ● ● ● ● ● ●   → 그대로       │
│  전체     ● ● ● ● ● ●   ↗ 쉬워지는 중  │
│                                        │
│  하나님이 세상을 이처럼 ▓사랑하사▓      │
│  ░독생자를░ 주셨으니 이는 그를          │
│  ▒믿는 자마다▒ 멸망하지 않고            │
│                                        │
│  ▓ 자주 · ▒ 가끔 · ░ 드물게 틀린 곳    │
├────────────────────────────────────────┤
│  08-28  정확도 87%  · 힌트 2      ● ●  │
│  08-26  정확도 71%                ● ●  │
└────────────────────────────────────────┘
```

Four things, in this order:

1. **투입 한 줄.** `최근 N회 · 힌트 M · T분`. 힌트 0 is omitted, the same way
   the sheet's rows already omit it — a "힌트 0" is a row of type spent
   saying nothing happened.
2. **정확도 스파크라인.** One tiny bar per check, oldest at the left. Time
   reads left to right even though `listChecks` hands the records back
   newest-first.
3. **난이도 변화.** Two rows, 첫 시작 and 전체, each the same coloured dots
   the list rows below already draw, plus a trend word.
4. **단어 히트맵.** The verse, printed, with the words this reader keeps
   failing tinted in three strengths. A legend line underneath.

The block does not appear at all when the sheet has fewer than **2** records.
One point is not a trend and one attempt is not a pattern; a summary drawn
over it would be the app asserting something it cannot know. Same judgement
`hasEventStats` makes when it declines to draw an empty chart.

### Trend wording

`쉬워지는 중` / `그대로` / `어려워지는 중` — not 개선 / 정체 / 악화.

The difficulty scale runs **0 = Impossible … 5 = xEasy**, so a *rising*
number means an *easier* verse. Any label built on 개선/악화 forces the
reader to hold that inversion in their head to know which way the arrow
should point, and forces every future maintainer to re-derive it. Naming the
direction the reader actually feels removes the question. The arrow then
matches the data: `↗` is the number going up, which is the verse getting
easier, which is the good news. With fewer than three rated points the row
draws its dots and no arrow at all.

### The verse is printed in full

The heat map necessarily shows the verse text, and the sheet is reachable
from a card whose body may be hidden. This is deliberate and not a leak: the
sheet already prints every saved attempt in full, and those attempts are the
verse. Hiding the heading text while printing the reader's own recitation of
it underneath would be theatre.

## The metric

### Input: exactly the rows the list shows

The block reads `checkOnlyHistory` — the same array the sheet renders,
`source`-less 점검 records only, capped at `HISTORY_LIMIT` (10) by
`listChecks`.

There is deliberately **no separate window constant**. `SUGGEST_WINDOW` is 5
because a proposal should react quickly; a summary sitting directly on top of
a list must describe *that list*. A block reading "최근 8회" above five rows
would be the same failure `stats/verses/+page.ts` guards against when it
resolves its rows through `buildEventCards`: a summary that disagrees with
what it summarises is worse than no summary.

This also means quiz rounds are excluded, matching the sheet. The dotted
suggestions do count quiz rounds (`countsAsRecall`), and the two differing is
correct — they answer to different neighbours.

### Reach

The give-up problem, stated plainly: `markMismatchedWords` walks the verse
forward and stops matching where the attempt ran out, so an attempt abandoned
after five words reports **every remaining word** as missed. Counting raw
misses would paint half the verse red on the strength of one surrender.

So each word's denominator is not "attempts" but "attempts that got this
far":

```ts
/** Accuracy at or above which a check with no saved `typed` is assumed to
 *  have reached the end of the verse.
 *
 *  markMismatchedWords reports the whole unreached tail as wrong, so an
 *  attempt abandoned halfway scores around half and an abandoned opening
 *  scores near nothing. Above this line the attempt plausibly went the
 *  distance and its misses are real misses; below it, nothing can be said.
 */
export const ASSUME_COMPLETE_MIN_ACCURACY = 0.5;

/** How many words into the verse this attempt reached.
 *
 *  Approximated from the attempt's own token count, not recovered exactly.
 *  markMismatchedWords walks a normalized character stream with a cursor, so
 *  "which word did they stop at" is not a thing it reports and not a thing
 *  this can ask it for. What is needed here is the denominator of a
 *  three-step tint, not an audit trail, and the approximation errs in the
 *  honest direction: a reader who typed fewer words than the verse holds did
 *  produce less of it.
 */
function reachOf(r: CheckRecord, wordCount: number): number {
  if (r.typed === undefined) {
    // The check predates the field, so how far it went cannot be recovered.
    // An attempt that scored well went essentially the whole way and is safe
    // to count whole; anything else is dropped rather than guessed at,
    // because guessing that a surrender reached the end is precisely the lie
    // this metric exists to prevent.
    return r.accuracy >= ASSUME_COMPLETE_MIN_ACCURACY ? wordCount : 0;
  }
  return Math.min(wordCount, r.typed.trim().split(/\s+/).filter(Boolean).length);
}
```

**Not `isRecallableAttempt`.** The obvious move is to borrow the existing
near-miss predicate from `quiz/games.ts`, and it is the wrong one twice over.
Its threshold is `RECALLABLE_MIN_ACCURACY = 0.9` and it excludes a perfect
score, because it answers *"is this sentence a good 틀린 곳 찾기 puzzle"* — a
rule of the game, as its own comment says, not a statement about how far a
reader got. Reusing it would drop every flawless check and every honest
80% one from the heat map, and would weld this metric to a constant that
will be tuned for the quiz. It would also make `memorize/` import from
`quiz/` for the first time; today nothing does, and the dependency runs the
other way.

`typed === ''` — saved having typed nothing — falls through to the second
branch and yields 0, which is right: it reached no word, so it is evidence
about none.

### Records without `missed`

A record written before `missed` existed measured nothing about word
positions. It is excluded from the heat map **entirely** — it contributes
neither reach nor misses. Letting it contribute reach alone would make it
count as a clean run for every word, which is the exact error `suggestedMarks`
already names: *"Absent is not an empty array … so it fills the window
silently rather than counting as a clean run."*

Such a record still counts toward 투입, the accuracy sparkline, and the
difficulty trend. It measured those.

### Word heat

For each word index `i` over the verse's words:

- `reached` — records whose `reachOf` is `> i`
- `missed` — of those, records whose `missed[]` contains `i`
- `rate` — `missed / reached`, or `null` when `reached === 0`

Tint, applied only when `reached >= 2`:

| rate | tint |
|---|---|
| `>= 2/3` | 자주 (strongest) |
| `>= 1/3` | 가끔 |
| `> 0` | 드물게 |
| `0` or `null`, or `reached < 2` | none |

The `reached >= 2` gate carries the same idea as `SUGGEST_MIN_MISSES`: one
incident is an accident, not a diagnosis. Without it a verse checked once
after a long gap would light up on a single slip.

Indices outside `0 … wordCount - 1` are discarded, as `suggestedMarks` does,
because an OYO verse can be edited shorter than the history describing it.

### Difficulty trend

Per dimension (`start`, `full`), take the non-null level values in
chronological order and fit a least-squares slope over their positions.

- fewer than 3 values → `unknown`
- `|slope| < 0.15` → `flat`
- `slope > 0` → `improving` (the number is rising, the verse is getting
  easier)
- otherwise → `worsening`

`0.15` per check is roughly one level of movement across a seven-check
window — the floor below which the reader's ratings are noise rather than a
direction. A tuning constant, named and exported so a test can state it.

A slope rather than first-versus-last: with a six-value series a single
generous evening at the end would otherwise flip the verdict.

### Effort totals

`checks` = record count. `hints` = sum of `hints ?? 0`. `ms` = sum of
`elapsedMs`. Rendered as `최근 N회 · 힌트 M · T분`, with 힌트 dropped at zero
and the duration shown in seconds below one minute.

## Why nothing is stored

The same four costs `suggestedMarks` refuses, and one more.

A stored heat map would need a schema version, a merge rule for two devices,
a decay policy, and an answer for an OYO verse edited underneath it. Derived
on read, none of those states can exist — and a stored map is worse than
merely redundant here: after the reader fixes a word, a stale map keeps
pointing at a place that is already fixed, which is the app confidently
telling them something false about their own progress.

The read costs nothing new either. `listChecks` already runs one `verseKey`
index lookup for the sheet, and everything here is arithmetic over the ten
rows it returned.

## Module layout

### `src/lib/memorize/diagnosis.ts` (new)

Pure, no Dexie import, no `Date.now()`. Mirrors `missStats.ts`.

```ts
export const MIN_RECORDS = 2;
export const MIN_REACH = 2;
export const FLAT_SLOPE = 0.15;
export const ASSUME_COMPLETE_MIN_ACCURACY = 0.5;

export type HeatTier = 'none' | 'rare' | 'sometimes' | 'often';
export interface WordHeat {
  reached: number;
  missed: number;
  rate: number | null;
  tier: HeatTier;
}

export type Trend = 'improving' | 'flat' | 'worsening' | 'unknown';

/** One entry per verse word, in verse order. */
export function wordHeat(records: CheckRecord[], wordCount: number): WordHeat[];

export function difficultyTrend(
  records: CheckRecord[],
  dim: 'start' | 'full'
): Trend;

/** Oldest first, so the sparkline reads left to right. */
export function accuracySeries(records: CheckRecord[]): number[];

export function effortTotals(
  records: CheckRecord[]
): { checks: number; hints: number; ms: number };
```

Every function takes records **newest-first**, as `listChecks` returns them,
and reverses internally where chronology matters. One convention, stated
once, rather than each caller remembering to flip.

### `src/lib/components/card/CheckDiagnosis.svelte` (new)

```ts
interface Props {
  /** 점검 records, newest first — the same array the sheet lists. */
  records: CheckRecord[];
  /** The verse's words, split exactly as markMismatchedWords indexes them. */
  words: string[];
}
```

Renders nothing when `records.length < MIN_RECORDS`.

Tints come from **three static classes**, not a computed
`color-mix`/`var(--token-${tier})`. Tailwind v4's `@theme` tree-shaking drops
tokens only reachable through an interpolated variable name, and a heat map
that renders uncoloured in production and correctly in dev is the worst
possible failure for this feature.

The accuracy sparkline borrows `EventStats`' floor: a bar is sized against
the plot height but never drawn shorter than a few px when its value is
non-zero, because a 20% check rendered as a hairline is indistinguishable
from a check that did not happen. Unlike `EventStats` the ceiling is fixed at
1.0 rather than the series maximum — accuracy is already a proportion, and
rescaling it to its own best value would draw a run of 40%, 45%, 50% as a
climb to the top of the box.

The difficulty dot is the same shape the sheet's rows already draw. The
`level` snippet moves out of `CheckHistorySheet.svelte` into a small shared
component (`DifficultyDot.svelte`), and the sheet's rows switch to it in the
same change, so both draw from one definition — a summary whose dots
disagreed in colour with the rows beneath it would read as two different
scales. The snippet's dashed treatment for `null` moves across unchanged, and
its `role="img"` labelling becomes **optional**: the sheet's rows pass a
`label` and keep speaking exactly as they do today, while the summary's rows
omit it and mark the pips `aria-hidden`, because the group above them already
names the whole sequence. Without that, ten summary pips and the rows beneath
them would both answer to `첫 시작 난이도 4` and every existing
`getByLabelText` assertion in `CheckHistorySheet.test.ts` would start
matching two elements and throw.

The three tints are named custom properties declared in `src/app.css`
**beside the ribbon palette, in plain `:root`** — not in `@theme`. That block
already documents why: tokens the Tailwind v4 scanner cannot see statically
get shaken out of the production build, and a heat map that renders
correctly in dev and colourlessly in production is the worst failure this
feature has available to it.

### `src/lib/components/card/CheckHistorySheet.svelte` (edit)

Gains `words: string[]`, renders `<CheckDiagnosis>` between the title and the
`<ul>`. The sheet stays scrollable as a whole; the diagnosis scrolls away
with the list rather than pinning, since on a phone a pinned summary plus a
sheet capped at `80vh` leaves too little room for the rows it is summarising.

### `src/lib/components/card/VerseCard.svelte` (edit)

One prop threaded: `words={words}` — the array already derived at line 175 as
`verse.w.split(/\s+/).filter(Boolean)`, which is character-for-character the
split `markMismatchedWords` indexes by. No new computation.

## Accessibility

- Colour is never the only signal, and the legend names the three strengths
  in text.
- **The heat map is readable text, not an image.** An earlier draft of this
  section asked for both `role="img"` on the paragraph *and* an
  `aria-label` per tinted word; those cancel each other out, because a
  `role="img"` makes its descendants presentational and their labels
  unreachable. The paragraph therefore stays plain text — a screen reader
  reads the verse, which is the right thing for a verse — and a
  **visually-hidden sentence follows it** naming the tinted words by tier:
  *"자주 틀린 곳: 사랑하사. 가끔 틀린 곳: 믿는, 자마다."* One sentence beats a
  per-word annotation interrupting every third word of scripture, and it
  does not depend on a bare `<span>`'s `aria-label` being announced — which
  `CheckHistorySheet`'s own comment already warns is not guaranteed.
- The difficulty rows and the accuracy sparkline *are* diagrams, so each is
  one `role="img"` naming its whole sequence
  (`첫 시작 난이도 변화: 3, 3, 4, 없음, 5`). Their individual pips and bars are
  `aria-hidden`. Ten pips walked one at a time teach a screen reader user
  nothing about a trend.
- The block is read-only. No word in it is tappable — tapping to mark belongs
  to marking mode, and a word that acts in one place and not another is worse
  than one that never acts.
- The 자주 tint must clear 4.5:1 against the text drawn on it in **both**
  themes. `DIFFICULTY_COLORS`' comment records what happens when this is
  assumed rather than checked: a black fill measured 1.4:1 on the dark card.

## Edge cases

| Case | Behavior |
|---|---|
| 0 or 1 records | Block does not render |
| Every record predates `missed` | Heat map omitted; effort, sparkline and trend still drawn |
| Every record predates `typed` | Reach falls back per `reachOf`; give-ups drop out |
| `typed === ''` | Reach 0 — evidence about no word |
| A single give-up plus one full attempt | Tail words have `reached === 1`, below `MIN_REACH`, so no tint |
| OYO verse edited shorter than its history | Out-of-range indices discarded |
| All ratings null | Trend `unknown`; dots row draws empty dots, no arrow |
| `wordCount === 0` | `wordHeat` returns `[]`; heat map omitted |
| Verse of 60+ words | Heat map wraps and scrolls with the sheet; no truncation |

## Testing

`tests/unit/diagnosis.test.ts` (new)

- A give-up after five words leaves the tail untinted, while a word actually
  missed inside the reached prefix is tinted
- `reachOf` fallbacks: no `typed` at or above `ASSUME_COMPLETE_MIN_ACCURACY`
  counts whole (including a flawless check, which `isRecallableAttempt` would
  have excluded); no `typed` below it contributes nothing
- `typed === ''` contributes no reach
- A record without `missed` contributes neither reach nor misses, but does
  contribute to `effortTotals` and `accuracySeries`
- `reached < MIN_REACH` yields tier `none` regardless of rate
- Tier boundaries at exactly 1/3 and 2/3
- Duplicate indices inside one record's `missed` count once
- Indices outside the word range are discarded
- `difficultyTrend`: improving, worsening, flat under `FLAT_SLOPE`, `unknown`
  below three points, nulls skipped without shifting the series
- `accuracySeries` comes back oldest-first from newest-first input
- `effortTotals` treats absent `hints` as 0
- `wordCount === 0` → `[]`

`tests/unit/CheckDiagnosis.test.ts` (new)

- Fewer than `MIN_RECORDS` renders nothing
- Three tiers map to three distinct classes, and an untinted word has none
- Each tinted word carries its `n회 중 m회` label
- 힌트 0 omits the segment; a duration under a minute reads in seconds
- `unknown` trend draws dots and no arrow
- All records lacking `missed` renders the block without the heat map

`tests/unit/CheckHistorySheet.test.ts` (extend)

- The diagnosis renders above the first row, and the existing row assertions
  still pass

The existing suite must stay green: **1588 tests across 114 files** on this
branch at `77445a1`.

## Delivery

Branch `feat/check-diagnosis`, cut from `feat/import-undo`'s worktree at
`77445a1`. Nothing here touches the OYO import, the quiz, or the player.
