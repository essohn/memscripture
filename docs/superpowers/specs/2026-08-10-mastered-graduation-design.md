# Mastered Graduation — Design

**Status:** Approved (2026-08-10) · single-phase delivery.

## Problem

The SRS moves a verse new → current → old → mastered. The last arrow does not
exist. `advanceBucket` maps `'old'` to `'old'`, `shouldGraduate` returns false
for it, and **no code anywhere assigns `'mastered'`**.

The scheduler already excludes `'mastered'` from the queue, and a test already
asserts that it does — so an entire branch of the design is dead code waiting
for a state nothing produces.

The practical harm is narrower than "verses are reviewed forever":
`selectOldActiveWindow` sorts the old pool by weakest recent ratings and takes
12, so a well-known verse naturally sinks out of rotation. Daily load does not
grow. What is missing is an **end state** — nothing is ever done, the old pool
grows without bound, and the reader has no signal that a verse is finished.

## Non-Goals

- **Reworking the new/current durations.** 7 and 42 days stay as they are.
- **A new "mastered" screen.** This changes what the scheduler queues; surfacing
  a completed-verses view is separate work.
- **Schema changes.** The rule is expressible with the fields `VerseProgress`
  already carries.

## Graduation — old → mastered

A verse graduates when its **last 4 reviews on both axes were 3 or better**.

There is deliberately no duration requirement, unlike new (7 days) and current
(42 days). Time in the bucket does not mean the verse is known; the reason
`'mastered'` is worth having at all is that it should be true.

Both axes must qualify. `citeRatings` measures recalling the opening and
`recallRatings` the whole verse; clearing one while failing the other is not
mastery, so each is checked independently over its own last 4 entries.

```
citeRatings   [.., 3, 4, 3, 4]   ✓
recallRatings [.., 4, 3, 3, 3]   ✓   → mastered

citeRatings   [.., 3, 4, 3, 4]   ✓
recallRatings [.., 4, 2, 3, 3]   ✗   → stays old
```

A verse with fewer than 4 reviews on either axis cannot graduate — there is not
yet evidence to graduate on.

The rating scale is 1–4 (1 = 떠오르지 않음 … 4 = 빨리 떠오름), so the bar is
"never worse than 적절히 떠오름across four consecutive reviews".

## Re-check — mastered is not forever

Memorized verses decay, and a mastered verse is excluded from the queue, so
without this it would never be tested again.

90 days after entering `'mastered'`, the verse surfaces once more:

- **3 or better** — stays mastered, and the 90-day clock restarts.
- **2 or worse** — returns to `'old'`.

Its rating history travels with it, so a demoted verse does not immediately
re-graduate on the strength of the four good scores that preceded the failure:
the failing score is now inside the last-4 window.

The re-check date needs no new field. `advanceBucket` already stamps
`enteredBucketAt` on every bucket change, so entering `'mastered'` records the
graduation moment, and the due date is `enteredBucketAt + 90 days`. Keeping the
clock restart in the same place means a passed re-check is just another
`enteredBucketAt` refresh.

## Scheduler

`buildTodayQueue` currently filters mastered out entirely. It now also includes
mastered verses that are due for re-check, capped at **2 per day** and oldest
due-date first.

The cap matters: a reader who memorizes a batch together graduates that batch
together, and 90 days later the whole batch comes due on the same day. Without
a cap the queue would spike from nothing to dozens.

## Architecture

| File | Change |
|------|--------|
| `src/lib/srs/buckets.ts` | `shouldGraduate` judges `'old'` on ratings; `advanceBucket` maps `old → mastered`; new `isRecheckDue(p, now)` and `applyRecheckResult(p, score, now)` |
| `src/lib/srs/scheduler.ts` | Queue re-check-due mastered verses, capped and oldest-first |
| `src/lib/srs/orchestrate.ts` | Unchanged in shape — it already routes through `shouldGraduate` / `advanceBucket` |

All thresholds are named constants in `buckets.ts`, beside the existing
`NEW_DURATION_DAYS` / `CURRENT_DURATION_DAYS`.

## Error handling

- **Fewer than 4 ratings on an axis** — cannot graduate, no error.
- **Empty rating arrays** — same; a verse never reviewed stays where it is.
- **A mastered verse with no `enteredBucketAt`** (data from before this change)
  — treated as due immediately, so it gets verified rather than silently
  trusted forever.

## Testing

| Target | What is asserted |
|--------|------------------|
| `buckets` | 4 consecutive ≥3 on both axes graduates; one axis failing does not; fewer than 4 reviews does not; a 2 anywhere in the last 4 does not; `advanceBucket` maps old → mastered and stamps `enteredBucketAt` |
| `buckets` | `isRecheckDue` is false inside 90 days, true after, true for a missing stamp; `applyRecheckResult` keeps mastered and restarts the clock on ≥3, demotes to old on ≤2 |
| `scheduler` | Mastered verses not yet due stay out of the queue; due ones appear; the daily cap holds when many are due; oldest due first |
| `orchestrate` | A qualifying old verse comes back in `graduated` for persistence |

## Open questions

None. The three numbers — 4 reviews, score 3, 90 days — are isolated constants
and expected to be tuned after use.
