# Quiz Priority Scheduling — Design

**Status:** Approved (2026-08-27) · Phase C of three, and the last piece of
the reader's original request.
Phase A built the session and the scope picker. Phase B added the two
recognition games. This one decides *which* verses a session asks about.

**Depends on:** `2026-08-27-quiz-session-design.md` (the session and
`buildQueue`), `2026-08-27-quiz-games-design.md` (the `source` field and the
two verdict-style games), `2026-08-26-miss-history-and-mark-suggestions-design.md`
(the history this reads, and one question it left open).

## Problem

The reader asked for this in the sentence the first two phases deferred:

> 자주 틀리는 구절의 경우 우선순위를 높여서 계속 체크대상이 되도록 하고 잘
> 패스되면 우선순위를 낮추는 식으로 스케쥴링하면 좋겠네

Today a session asks about every verse in the scope, in the order the scope
produced. A 48-verse 암송 DAY is 48 rounds; a package is hundreds. Nothing
notices that four of those verses fail every time and thirty have not been
wrong since spring. The reader either quizzes the whole scope or narrows it by
hand, and the app — which has recorded every mistake since Phase 1 — says
nothing about which verses are worth the next ten minutes.

## Non-Goals

- **No second spaced-repetition system.** `srs/scheduler.ts` schedules 암송
  진도 and owns that meaning of "due". This ranks quiz rounds within a scope
  the reader already chose. Two schedulers answering the same question about
  the same verse is a defect, so this one never claims to say when a verse is
  due for 점검.
- **No new stored state.** No new `CheckRecord` field, no Dexie version bump,
  no priority column. Everything here is computed from records already
  written.
- **No score shown to the reader.** The picker says how many verses today's
  session holds, not why these ones. A visible number invites managing the
  number.
- **No new picker control.** Session size is a constant, not a chip row.

## The rule

### Two signals

For each verse, reduce its recent history to:

```ts
export interface VerseSignal {
	/** Failures among the recent unassisted records. */
	fails: number;
	/** When anything last asked about this verse. Absent if nothing ever has. */
	lastAskedAt?: number;
}
```

`fails` counts records that did not pass. `lastAskedAt` is the newest
`checkedAt` of *any* record for the verse.

### Pass is `accuracy >= 1`

All four sources share one test, and it is deliberately a verdict rather than
a measurement:

| `source` | What `accuracy >= 1` means |
|---|---|
| absent (점검) | recited flawlessly |
| `quiz` | typed the whole verse correctly |
| `quiz-opening` | produced the opening |
| `quiz-spot` | found the mistake, or correctly said there was none |

Phase B's spec warned that the last two write a 1 that is a judgement, not a
proportion. Used as a judgement it is exactly right; **the four accuracies
must never be averaged together.** Two words typed correctly is not "98% of
the verse", and a mean would rank it above a 점검 that missed one word.

A 점검 at 0.98 is a failure by this rule. That is intended: the reader got
something wrong, which is what "자주 틀린다" means.

### Assisted records are excluded before the window is taken

A record with `hints` truthy is dropped, and only then are the most recent
`PRIORITY_WINDOW` taken. Filtering before slicing, not after, is the same
order `listPerfectVerseNos` already uses, and it matters: a reader who checks
a hard verse with hints five times would otherwise flush every real failure
out of the window and watch their weakest verse sink to the bottom.

"Assisted" means `hints` is truthy, so both `undefined` and `0` count as
unassisted — the first predates the hints feature and treating it as assisted
would discard most of the history, the second is a check where the reader
pressed 힌트 zero times, which is exactly an unassisted check.

An assisted record is not evidence in either direction — it neither raises
nor lowers priority. It does still set `lastAskedAt`: the reader did put the
verse in front of themselves, whatever they leaned on to get through it.

**This closes the question Phase 1 left open.** That spec recorded, as Open,
that an assisted clean check writes `missed: []`, occupies a slot in the
5-check suggestion window, and can evict an earned underline suggestion.
`missStats.suggestedMarks` takes the same fix — drop assisted records, then
slice `SUGGEST_WINDOW` — for the same reason and in the same shape.

### Score

```
score = fails × FAIL_WEIGHT + min(daysSince(lastAskedAt), STALE_CAP)
```

`daysSince` is `max(0, floor((now - lastAskedAt) / 86_400_000))` — clamped at
zero so a record stamped ahead of the clock cannot subtract from a score. A
verse never asked about scores `STALE_CAP`. Higher sorts first. Ties break by
`QuizItem.id` ascending.

| Constant | Value | Why |
|---|---|---|
| `PRIORITY_WINDOW` | 5 | The same number `missStats.SUGGEST_WINDOW` uses — "recent enough to still be true about me" |
| `FAIL_WEIGHT` | 7 | One failure is worth about a week of neglect |
| `STALE_CAP` | 30 | A month untouched and three months untouched are no longer different |
| `SESSION_SIZE` | 10 | One sitting |

What the numbers produce:

| Verse | Score |
|---|---|
| failed 5 of the last 5, asked today | 35 |
| never asked | 30 |
| passed 5 of 5, last asked 60 days ago | 30 |
| failed 2 of 5, last asked 10 days ago | 24 |
| passed 5 of 5, asked today | 0 |

An unproven verse outranks a verse with three recent failures, and a verse
that fails every time outranks an unproven one. Both readings are the
intended ones.

The id tie-break is what makes a fresh scope advance. Every verse in an
untouched package scores 30, so the first session takes the first ten in id
order — and having been asked, their `lastAskedAt` drops them to the bottom,
so the next session takes the next ten. No rotation hash is needed; being
asked is itself the rotation.

`now` is a parameter, never `Date.now()` read inside the rule. The route
stamps it once when a 대상 is picked and passes it to the picker as a prop, so
the count the reader sees and the session they start are ranked against the
same instant — the picker builds the queue and hands it to `onStart`, and the
route never re-ranks. Tests pass their own timestamp and are not
clock-dependent.

## The data path

### One scan replaces two

History is read twice today, both times asynchronously and both times behind
a stale-result guard:

- `QuizScopePicker` runs an `$effect` calling `loadAttempts(queue)` to count
  how many verses have a question for 틀린 곳 찾기.
- `/quiz`'s `start()` calls `loadAttempts(picked)` again to build the rounds.

Phase B's critical defect lived inside the first of those guards: the effect
compared a captured array against a `$state`-proxied one, the identity never
matched, and the result was silently dropped. Priority needs the same records
a third time, so rather than add a third read, `resolveTarget` reads history
once and returns everything derived from it:

```ts
resolveTarget(target): Promise<{
	items: QuizItem[];
	ratings: Map<string, ItemRating>;
	signals: Map<string, VerseSignal>;   // new
	attempts: Map<string, string>;       // was loadAttempts
}>
```

`resolveTarget` is the joiner: `checkHistory` does the scan, `priority.signalOf`
turns each verse's records into a `VerseSignal`, and `resolveTarget` returns the
reduced maps. Raw `CheckRecord`s never travel down the prop chain — a
900-verse package would push nine thousand objects into a presentation
component for a rule that needs two numbers per verse.

`loadAttempts` stops being a separately-called read; its near-miss rule moves
into the single scan unchanged. The picker's `$effect` and the route's
`runVersion` guard are both deleted — the picker becomes a component that
only reads props, and the attempt count appears with the rest of the scope
instead of arriving late.

`checkHistory.ts` gains one bulk read, shaped like `listLastCheckedAt`: one
range scan per package on the `verseKey` index, never a query per verse.

```ts
/** Recent records per verse, newest first, capped at HISTORY_LIMIT. */
export async function listRecentChecks(
	packageIds: string[]
): Promise<Map<string, CheckRecord[]>>;
```

### Failure degrades, it does not empty the scope

The history read inside `resolveTarget` catches its own failure and yields
empty maps rather than rejecting. A failed verse read still empties the scope
— that is today's behaviour and the picker already says so — but a failed
history read must not, because the verses are fine and the reader can still
quiz them:

- Empty `signals`: every verse scores `STALE_CAP`, so the order is id order
  and the cap still applies. The session is unranked, not broken.
- Empty `attempts`: 틀린 곳 찾기 has nothing to ask, the picker says
  `아직 내 오답 기록이 없어 출제할 문제가 없습니다`, and 시작 stays disabled.

This replaces the route's current spot-failure path, which started the run
anyway and reported it by setting `unsaved = picked.length` — a storage-error
counter standing in for a read error. That path is deleted with the read.

### `buildQueue` splits in two

The current `buildQueue` filters by tier and nothing else. Ranking needs a
different input set than filtering does, and 틀린 곳 찾기 needs its
eligibility applied *before* the cap, so the one function becomes two:

```ts
/** The scope narrowed to the chosen 난이도 그룹. Unranked, uncapped. */
export function filterByTier(
	items: QuizItem[],
	tiers: Set<Tier>,
	ratings: Map<string, ItemRating>
): QuizItem[];

/** Today's session: the highest-priority verses, capped at SESSION_SIZE. */
export function buildQueue(
	pool: QuizItem[],
	opts: {
		signals: Map<string, VerseSignal>;
		now: number;
		/** When present, only these ids may be asked. 틀린 곳 찾기 passes the
		 *  ids it has a recorded attempt for. */
		eligible?: Set<string>;
	}
): QuizItem[];
```

`eligible` is applied before the sort, not after the slice. Applied after,
the ten highest-priority verses could contain no recorded attempts at all and
a 틀린 곳 찾기 session would open with zero rounds — the failure mode the
picker's count exists to prevent.

`filterByTier` keeps the empty-tier rule (`tiers.size === 0` yields nothing)
and the scope's own ordering, which `buildQueue` then replaces.

## What the reader sees

One line in `QuizScopePicker` changes:

| Scope after the tier filter | Line |
|---|---|
| 10 verses or fewer | `7구절` — unchanged |
| more than 10 | `48구절 중 오늘 10구절` |

The 틀린 곳 찾기 count line keeps its wording and now renders immediately
rather than after a read:

```
10구절 중 2개에 내 오답 기록이 있습니다
```

Its total is the capped queue, which is what the session will actually ask
about. Both disabled reasons keep their current text and their live regions;
`고른 범위에 구절이 없습니다` now reads from the tier-filtered pool, so an
empty pool and an empty-after-eligibility queue stay distinguishable.

No new control, no explanation of the ranking. Which verses come up is
learned by playing, not read off the screen.

## Files

| File | Change |
|---|---|
| `src/lib/quiz/priority.ts` | New. `VerseSignal`, `signalOf`, `priorityOf`, the four constants. Pure. |
| `src/lib/db/checkHistory.ts` | Add `listRecentChecks`. |
| `src/lib/memorize/missStats.ts` | Drop assisted records before slicing `SUGGEST_WINDOW`. |
| `src/lib/quiz/scope.ts` | `resolveTarget` returns `signals` and `attempts`; `loadAttempts` folds into the single scan. |
| `src/lib/quiz/session.ts` | Split `buildQueue` into `filterByTier` and the ranking `buildQueue`. |
| `src/lib/components/quiz/QuizScopePicker.svelte` | Delete the `$effect`; take `signals`/`attempts` as props; the two count lines. |
| `src/routes/quiz/+page.svelte` | Delete `runVersion` and the spot read; stamp `now` on pick and pass it with `signals`/`attempts` down. |

## Testing

Unit, table-driven, on the pure rule:

- Window: only the five most recent unassisted records count.
- Assisted: a record with `hints` truthy is dropped *before* the slice — a
  verse with five assisted records after two failures still reports two.
- `hints === undefined` counts as unassisted.
- Pass at `accuracy >= 1` for each of the four `source` values; a 점검 at
  0.98 is a failure.
- `lastAskedAt` takes the newest record including assisted ones.
- `STALE_CAP` caps; never-asked scores `STALE_CAP`.
- Ordering: the five worked examples in the score table sort as listed.
- Ties break by id, and a fresh scope advances across two sessions.

`fake-indexeddb` on the reads:

- `listRecentChecks` groups by `verseKey`, newest first, capped at
  `HISTORY_LIMIT`, and issues one scan per package.
- `resolveTarget` fills all four returned values.
- A rejecting history read yields empty `signals`/`attempts` and intact
  `items`.

Component and route:

- `QuizScopePicker` renders `48구절 중 오늘 10구절` above the cap and `7구절`
  below it, with no async wait for the attempt count.
- `/quiz` starts a session of at most `SESSION_SIZE` rounds from a larger
  scope, and a 틀린 곳 찾기 session asks only about verses with an attempt.

**The route tests are mandatory, not optional.** Phase B's spec claimed this
repo could not render a `+page.svelte` under vitest. That was false —
`quizPageAttempts.test.ts`, `tableImportPage.test.ts` and
`statsVersesPage.test.ts` all do it — and the false premise left `/quiz`
untested across two phases, which is exactly where both critical defects hid.
Extend `quizPageAttempts.test.ts`; do not skip this row.

Existing `buildQueue` tests split between `filterByTier` and the new
`buildQueue` rather than being deleted. `missStats` gains one test for the
assisted-eviction fix.

Baseline before this work: **1496 tests, 109 files** on `origin/main`
@ `5981092`.

## Known limit

Filtering assisted records before the window protects the *read*, not
storage. `prune` caps a verse at `HISTORY_LIMIT` rows and prefers
`countsAsRecall` ones, and an assisted 점검 is recall-bearing — its `source`
is absent — so ten hinted checks on one verse can evict older failing quiz
rows permanently. `signalOf` then sees no failures, and the verse's
`lastAskedAt` keeps resetting, so it sinks.

Accepted rather than fixed. Reaching it takes more than `HISTORY_LIMIT`
records on a single verse with the newest ten all assisted, and the fix lives
in `prune`'s retention policy — which is Phase 1 machinery serving the history
sheet and the 만점 badge as much as this rule. Changing it here would be
changing what the app remembers in order to change what the quiz asks.

## Open

None. The one question Phase 1 left open is closed above.
