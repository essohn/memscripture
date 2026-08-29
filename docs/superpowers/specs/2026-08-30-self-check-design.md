# Self Check — Design

**Status:** Approved (2026-08-30) · single-phase delivery. Extends the record
`2026-08-26-miss-history-and-mark-suggestions-design.md` began storing and
`2026-08-29-check-diagnosis-design.md` began reading.

## Problem

Not every check is typed. A reader looks at a citation, recites the verse in
their head, and knows how it went — but the app has no way to hear it. The
only acts that leave a record are 점검 (type the whole verse), the three quiz
games, and 포기.

So the most common form of review leaves no trace at all. 최근 점검 goes on
reporting a date from last week, the 만점 badge fades on a verse the reader
has been keeping sharp all along, and the new diagnosis block summarises a
history with holes in it.

The first shape of this idea was to infer the check from a difficulty change
— if the rating moved, they must have checked. That was rejected: the rating
often does *not* move (a verse that was Easy and is still Easy was still
checked), and inferring intent would mean hooking six call sites that write
ratings today, seven counting the quiz's new rating drop.

So: an explicit button. The reader says they checked it.

## Non-Goals

- **Guessing a score.** A self check reports no accuracy of its own, no
  missed words, no attempt text. It says one thing — "I did this, and it
  went fine" — and everything derived from *where* a verse breaks keeps
  reading only the records that measured that.
- **Replacing 포기.** 포기 already records a check without typing, but it
  writes a near-zero accuracy, which is honest for an abandoned attempt and
  the exact opposite of the truth here. These are two different acts.
- **A second difficulty picker.** The button records whatever the verse is
  rated at that moment. Changing the rating stays the badge's job.
- **A streak or a counter.** One row per verse per day, no tally, no
  celebration. The 활동 heatmap already answers "how often do I show up".
- **Backfilling.** Verses checked in the reader's head before this shipped
  stay unrecorded. There is nothing to recover them from.

## User-facing behavior

A third button joins 암송 and 점검 in the card's head: **확인**.

Tapping it records that this verse was checked, now, at whatever difficulty
it currently carries. The card's 최근 점검 line updates immediately, the 만점
badge lights (see below), and the row appears in the 점검 기록 sheet.

Tapping it a second time the same day does not add a row — it re-stamps the
one already there. The button shows its state: once today's check exists, it
reads as done, so the reader can see at a glance which verses in a list they
have already been through today.

Tapping it on a different day adds a new row.

### What a self check claims

**It counts as a pass.** The 만점 badge is granted or kept by it, exactly as
a flawless typed 점검 would.

This was the deliberate choice, and it is worth naming what it costs: the
badge stops meaning "the app watched them recite this perfectly" and starts
meaning "the reader says this one is solid". A reader who taps 확인 without
really checking is lying to themselves, and the app will believe them. The
trade is that the badge now tracks the reader's actual review practice
instead of only the fraction of it that goes through a keyboard.

It follows that the diagnosis block's accuracy sparkline draws a full-height
bar for a self check, and its difficulty trend takes the verse's current
rating as a point. Both are consequences of the same decision, stated here so
that neither reads later as a bug: a day the reader only tapped 확인 looks, on
that chart, like a day they recited it perfectly — which is exactly what
"counts as a pass" means.

Two things it still does **not** claim, because it measured neither:

- **Where the verse breaks.** No `missed`, so the word heat map and the
  dotted underline suggestions never see it.
- **A sentence to hand back.** No `typed`, so 틀린 곳 찾기 cannot build a
  question from it. `isRecallableAttempt` excludes a perfect score anyway.

## The record

A new `source` value, `'self'`, on `CheckRecord`:

| field | value | why |
|---|---|---|
| `source` | `'self'` | the only thing distinguishing it |
| `accuracy` | `1` | it counts as a pass; this is the mechanism |
| `elapsedMs` | `0` | nothing was timed |
| `start` / `full` | the verse's current rating | so the difficulty trend gets a point |
| `hints` | absent | none were offered, let alone spent |
| `missed` | absent | not measured — **not** an empty array |
| `typed` | absent | not measured — **not** `''` |

The three absences are load-bearing and follow the discipline the table
already keeps in three places: absent means "this was never measured", `[]`
and `''` mean "measured, and there was nothing". `suggestedMarks` names this
rule, `wordHeat` obeys it, and the history sheet prints a different sentence
for each of `typed`'s three states.

That last one needs a fourth sentence. Today an absent `typed` renders as
*"입력 본문이 기록되기 전의 점검입니다"*, which would be a lie about a self
check — it does not predate the field, it never had one. The sheet renders a
self check's row distinctly instead: no accuracy line, no attempt block, and
a label saying what it is.

## Three predicates, one concept

The table is read through three different filters that all mean slightly
different things, and each currently spells its own rule inline:

| Reader | Rule today | Must become |
|---|---|---|
| `countsAsRecall` | `source === undefined \|\| source === 'quiz'` | include `'self'` |
| `listLastCheckedAt` | `if (r.source) continue` | admit `'self'` |
| `VerseCard.checkOnlyHistory` | `!r.source` | admit `'self'` |
| `listPerfectVerseNos` | via `countsAsRecall` | follows automatically |
| `prune` | via `countsAsRecall` | follows automatically |
| `suggestedMarks` | fills the window silently | **exclude entirely** — see below |

Two of those rows would end up repeating `source === undefined || source ===
'self'` in files that do not otherwise know about each other. So the concept
gets a name:

```ts
/** A check the reader performed on this verse, typed or not.
 *
 *  Distinct from countsAsRecall, which asks whether a row is evidence of
 *  recall — a quiz round is, and it is not a 점검. This asks whether the
 *  reader sat down with this verse and said how it went, which is what the
 *  card's 최근 점검 line reports and what the history sheet lists.
 */
export function countsAsCheck(r: Pick<CheckRecord, 'source'>): boolean {
	return r.source === undefined || r.source === 'self';
}
```

and `countsAsRecall` is rewritten in terms of it:

```ts
export function countsAsRecall(r: Pick<CheckRecord, 'source'>): boolean {
	return countsAsCheck(r) || r.source === 'quiz';
}
```

This is not a new concept. It is a name for one that was already spelled out
three times in three different ways.

### Why `suggestedMarks` excludes self checks outright

`suggestedMarks` takes the five most recent qualifying records and tallies
their `missed` positions. A record with no `missed` "fills the window
silently rather than counting as a clean run" — the right rule for a check
written before the field existed, because that check *did* have missed words
and the app simply failed to write them down.

A self check is not that. It never had positions to record. Letting five of
them fill the window would retract every underline suggestion the reader had
earned, on the strength of five taps that measured nothing — and the reader
who taps 확인 five days running is precisely the one still working on the
verse. So they are filtered out before the window is taken, alongside the
assisted checks the same line already drops.

This costs `suggestedMarks` a widened signature. It takes
`Pick<CheckRecord, 'missed' | 'hints'>` today and so cannot see `source` at
all, while its one caller hands it `checkHistory.filter(countsAsRecall)` —
which self checks now pass. The `Pick` gains `'source'`, keeping the rule
inside the function beside the two it already enforces rather than making it
a condition the call site has to remember.

## Same-day update, and why the id is deterministic

The row's id is derived, not stamped:

```
`${verseKey}:self:${todayLocalKey()}`     // 242_krv:1:self:2026-08-30
```

Re-tapping 확인 is then a plain `put` at the same id. No lookup, no delete,
no branch for "does today's row exist".

**A timestamped id would have been a trap.** Deleting the old row to write a
new one looks equivalent, and is not: `checkHistory` merges by union, so a
row deleted locally without a tombstone comes straight back on the next sync
and the verse ends the day with two self checks. Writing a tombstone instead
would leave one behind per verse per day, forever, in a snapshot that is
uploaded whole on every sync.

The day boundary is the local date, from `todayLocalKey()` — the same
function the 활동 table keys on, so "today" means the same thing in both.

### The merge has to prefer the later stamp

`mergeSnapshots` currently unions `checkHistory` by id, on the stated grounds
that ids are unique per check so there is nothing to resolve. `unionById`
writes local first and remote second, so **remote silently wins any
collision**.

Deterministic ids create exactly such a collision, and the current rule
resolves it backwards: a phone that checked at 21:00 merges against a tablet
that checked at 09:00 and keeps 09:00. Both are "today", so nothing looks
broken — the card just quietly reports a stale hour.

`checkHistory` therefore moves from `unionById` to
`mergeById(..., (c) => c.checkedAt)`, which keeps whichever copy has the
greater `checkedAt`. Every id in the table today is unique per check, so
there are no collisions to resolve and **this is a no-op for every existing
row**; it exists for the new ones.

### A deleted self check must be re-creatable

Deleting a check writes a tombstone that `mergeSnapshots` subtracts from the
union — that is what stops another device handing the row back. With a
deterministic id, re-tapping 확인 the same day writes the same id the
tombstone names, and the next sync deletes it again.

So recording a self check lifts any tombstone for its id, the way
`restoreCheck` already does. The reader deleting today's check and then
deciding to record it again is an ordinary sequence, not an error, and it
must survive a sync.

## History limit: 10 → 50

`HISTORY_LIMIT` rises to 50.

The cap only costs anything to a verse that has already hit it. Measured on
a real row — a full Korean verse in `typed` plus a 21-entry `missed` array —
one record is **455 bytes**. A 1147-verse library with every verse at the cap
would carry 24.9 MB; this reader's whole table today is **22 rows, 10 KB**.
The ceiling is a guard against a pathological future, not a live constraint,
and the verses that reach it are the ones whose history is worth the most.

The cost is paid on every sync in both directions — `syncFlow` downloads the
whole remote snapshot and uploads the whole merged one, with no delta — which
is why the number is worth stating rather than waving at.

### The diagnosis block gets its own window

`CheckDiagnosis` was built to read "exactly the rows the list shows", with no
window constant of its own, so that a summary could never disagree with the
list beneath it. At 50 rows that becomes 50 sparkline bars at 3px apiece and
50 difficulty pips wrapping down the sheet.

So it takes a window: `DIAGNOSIS_WINDOW = 10`, the most recent records of
those it is given. The no-disagreement rule survives intact because the block
already opens by naming its own scope — **최근 10회** over a 50-row list is a
true sentence, where 최근 8회 over a 5-row list was not. The spec comment that
forbade a separate window is updated with this reasoning rather than deleted;
the rule it was protecting is still the rule.

## The button

A third control in the card's head, beside 암송 and 점검, styled as their
sibling — the same pill, the same 11px, the outline treatment 점검 uses rather
than 암송's filled accent, because 확인 is the lighter of the two acts.

| State | Reads |
|---|---|
| No self check today | `확인` |
| Checked today | `확인함`, in the accent colour |

Tapping it in either state records; the second tap re-stamps. It is never
disabled — a reader who checked at breakfast and again at night has done the
thing twice, and the button refusing them would be the app arguing.

The button appears wherever 점검 does (`checkable`), and nowhere else: a card
that cannot be checked cannot be self-checked either.

**Accessibility.** The label carries the state, so the change is not colour
alone. `aria-pressed` is wrong here — this is not a toggle, and tapping it
again does not turn it off — so the state lives in the accessible name:
`{heading} 확인 기록` and `{heading} 오늘 확인함, 다시 기록`.

## Module layout

| File | Change |
|---|---|
| `src/lib/db/local.ts` | `source` union gains `'self'`; comment on what it means |
| `src/lib/db/checkHistory.ts` | `countsAsCheck`; `countsAsRecall` in terms of it; `recordSelfCheck`; `listLastCheckedAt` admits self checks |
| `src/lib/memorize/missStats.ts` | `Pick` widens to `'source'`; drop self checks before the window is taken |
| `src/lib/memorize/diagnosis.ts` | `DIAGNOSIS_WINDOW = 10` |
| `src/lib/sync/merge.ts` | `checkHistory` unions by later `checkedAt` |
| `src/lib/components/card/CheckDiagnosis.svelte` | slice to the window |
| `src/lib/components/card/CheckHistorySheet.svelte` | render a self-check row distinctly |
| `src/lib/components/card/VerseCard.svelte` | the 확인 button; `checkOnlyHistory` admits self checks |

`recordSelfCheck` lives beside `recordCheck` rather than in a new module: it
writes the same table, prunes with the same rule, and the two are read
together everywhere.

```ts
export async function recordSelfCheck(
	packageId: string,
	verseNo: number,
	rating: { start: DifficultyLevel | null; full: DifficultyLevel | null },
	now: number = Date.now(),
	dateKey: string = todayLocalKey()
): Promise<void>;
```

`now` and `dateKey` are injectable for the same reason `recordCheck`'s
`checkedAt` is: a test asserting "the same day updates, the next day adds"
cannot wait until midnight.

## Edge cases

| Case | Behavior |
|---|---|
| 확인 tapped twice in a minute | One row, later `checkedAt` |
| 확인 tapped at 23:59 and 00:01 | Two rows — the local date changed |
| Verse has no rating yet | Row stores `start: null, full: null`; the difficulty trend skips it, as it skips 포기 |
| Today's self check was deleted, then 확인 tapped again | Row returns and the tombstone is lifted; survives the next sync |
| Two devices check the same verse the same day | One row, the later stamp wins |
| Self check is the newest record | 만점 badge lights; 최근 점검 shows now |
| A typed 점검 lands after today's self check | Both rows exist; the typed one is newer and decides the badge |
| 50 records for one verse | Oldest recall-bearing row is pruned, as today |
| Sheet shows 50 rows | Diagnosis still summarises 10 and says so |

## Testing

`tests/unit/checkHistory.test.ts` (extend)

- `recordSelfCheck` writes `accuracy: 1`, `elapsedMs: 0`, and leaves `hints`,
  `missed` and `typed` absent — asserted as absent, not falsy
- the same `dateKey` updates in place; a different one adds
- the id is `${verseKey}:self:${dateKey}`
- a tombstone for that id is lifted
- `countsAsCheck` / `countsAsRecall` over all four source values
- `listLastCheckedAt` reports a self check, still ignores quiz rows

`tests/unit/missStats.test.ts` (extend)

- five self checks do not displace an earned suggestion

`tests/unit/merge.test.ts` (extend)

- colliding ids keep the greater `checkedAt`
- rows with distinct ids still union, unchanged

`tests/unit/CheckDiagnosis.test.ts` (extend)

- given more than `DIAGNOSIS_WINDOW` records, reads the newest 10 and the
  effort line says 최근 10회

`tests/unit/CheckHistorySheet.test.ts` (extend)

- a self-check row shows its label and neither an accuracy nor an attempt
- it does not print 입력 본문이 기록되기 전의 점검입니다

`tests/unit/VerseCard.*.test.ts` (extend or new)

- 확인 records and the button's accessible name changes
- a second tap records again rather than doing nothing
- no 확인 button where the card is not checkable

The existing suite must stay green: **2055 tests across 134 files** on this
branch at `7f056f3`.

## Delivery

Branch `feat/self-check`, cut from `main` at `7f056f3`.
