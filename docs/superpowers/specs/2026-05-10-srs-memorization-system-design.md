# Phase 3 — SRS Memorization System (2-12-12) — Design Spec

**Date:** 2026-05-10
**Status:** Draft → User review
**Scope:** Adds the core daily memorization system to memscripture. Implements a 2-12-12 bucket model with two-axis self-rating, activity-based time progression, intake-on-tap, and a Today queue. Turns the app from "Bible browser + memorize mode" into a daily-use memorization tool.

## Goal

Today's home hero literally reads "SRS 복습은 곧 추가됩니다" — Phase 3 fills that gap. After this phase a user opens memscripture, sees a personalized review queue, completes 5–15 cards in a few minutes, and watches verses graduate through New → Current → Old over weeks. The system rewards consistency without punishing absence.

The design is an explicit homage to the Navigators TMS physical-card-wallet system (2-12-12), digitized faithfully: predictable time-based flow for the learning phase (New/Current), adaptive rating-driven surfacing for the retention phase (Old). No black-box SRS algorithm. No external library beyond what we already use.

## Vision: 2-12-12

```
[Unmemorized pool — verses in active package]
            │ user taps "시작"
            ▼
    ┌─────────────┐
    │ New (2)     │  reviewed every active day
    │             │  graduates after 7 active days
    └──────┬──────┘  ratings: descriptive only
           │
           ▼
    ┌─────────────┐
    │ Current     │  reviewed on a 3-day rotation (4–6/day)
    │  (12)       │  graduates after 42 active days
    └──────┬──────┘  ratings: descriptive only
           │
           ▼
    ┌─────────────────────────┐
    │ Old pool (∞)            │  rolling 12-card "active window"
    │   active window of 12 ◄ │    surfaces 1–2/day
    └─────────────────────────┘  ratings: drive priority surfacing
```

Each verse review captures two ratings:

- **Cite** — citation (e.g., "고후 5:17") → recall the **first clause** of the verse from memory.
- **Recall** — full verse recital from memory.

Title is an optional hint, user-revealed, not rated. (Title is a topical label like "중심되신 그리스도" — useful as a memory hook but not what the user is actually trying to recite.)

Each axis uses 4-step Anki-style scale: **Again / Hard / Good / Easy**. The 4-step granularity is forward-compatible with future voice checking, where latency × accuracy maps naturally to the 4 buckets.

## User Experience

### Today screen (홈 hero 진화)

Replace the current placeholder hero ("오늘은 암송할 구절이 아직 없어요") with a queue summary.

```
┌─ Today ──────────────────────────┐
│ ✨ 오늘                           │
│                                  │
│ 5장 남음                         │
│ 새 2 · 복습 3                    │
│                                  │
│             [시작 →]             │
└──────────────────────────────────┘
```

Empty / edge states:
- **No active package**: hero says "아직 학습을 시작하지 않았어요" + recommended package card.
- **All done today**: "오늘은 다 했어요 🎉" + light next-up summary.
- **Slot available, no commitment yet**: "다음 추천 구절이 있어요" + suggestion card with [학습 시작] button.

### Review session

Sequential reveal per card — never shows all 8 buttons at once.

```
Stage 1: Citation only
┌────────────────────────┐
│        고후 5:17        │
│                        │
│   [Title 힌트 보기]    │  ← optional
└────────────────────────┘
        ↓ tap "Reveal"

Stage 2: First clause + Cite rating
┌────────────────────────┐
│        고후 5:17        │
│                        │
│   그런즉 누구든지      │
│   그리스도 안에 있으면 │
│                        │
│ [Again][Hard][Good][Easy] │  ← Cite axis rating
└────────────────────────┘
        ↓ user rates → next stage

Stage 3: Full text + Recall rating
┌────────────────────────┐
│  ... 새로운 피조물이라  │
│  이전 것은 지나갔으니  │
│  보라 새 것이 되었도다 │
│                        │
│ [Again][Hard][Good][Easy] │  ← Recall axis rating
└────────────────────────┘
        ↓ user rates → next card
```

The existing swipe-curtain memorize mode is **not** part of daily review. It remains as a separate deep-practice mode reachable from verse detail (already implemented).

### Intake (B+C hybrid: system suggests, user commits)

When a New slot is empty, the slot is occupied by a *suggestion prompt*:

```
[New section]
┌──────────────────────────┐
│ 1. 중심되신 그리스도     │  ← active New verse #1
│    고후 5:17 · 3/7일     │     (in progress)
└──────────────────────────┘
┌──────────────────────────┐
│ + 다음 추천: 고후 5:21   │  ← suggestion (slot #2)
│   "[학습 시작]"           │
└──────────────────────────┘
```

Tapping `[학습 시작]` promotes the suggestion to active New verse #2. Slot is then full.

Recommendation source: next unmemorized verse in the active package, ordered by `verseNo` (i.e., the package author's intended order).

No automatic forced intake. No calendar push. The empty slot's visual presence is itself the gentle nudge.

### Active package switching

The library page already lists packages and their verse counts. Phase 3 adds:

- Per-verse bucket indicator on the verse list (small dot left of cite line: `●` for active, color-coded by bucket).
- "이 패키지를 학습 중으로" toggle on the package detail header (replaces or coexists with the existing toggle UI). Sets this package as `activePackage`.
- "이 패키지 전체 외움으로 표시" overflow menu — bulk-marks all verses in the package as `mastered`. Skips the New/Current cycle entirely. Reversible via "다시 학습" per verse.

In-flight cards from the *previous* active package remain in the queue and graduate normally — switching does not reset their state. Recommendation source switches immediately.

### Mark a single verse as memorized

In verse detail page:
- "이미 외움" button → moves the verse directly to `mastered` (skips queue entirely; no further surfacing).
- "다시 학습" button (visible when bucket ≠ none) → returns to unmemorized pool and clears progress.

Both per-verse and per-package "외움" actions land in the same `mastered` bucket — single semantic. Users wanting periodic review of confident verses should let them graduate naturally to Old (where the priority surface still picks them up).

## Data Model

New types in `src/lib/types.ts`:

```ts
export type Bucket = 'new' | 'current' | 'old' | 'mastered';

export interface VerseProgress {
  id: string;              // composite key: `${packageId}:${verseNo}`
  packageId: string;
  verseNo: number;
  bucket: Bucket;
  enteredBucketAt: number; // ms timestamp; reset on bucket transition
  daysActiveInBucket: number; // count of distinct active days while in current bucket
  lastReviewedAt: number;
  citeRatings: number[];   // sliding window: last 10 ratings (1=Again, 4=Easy)
  recallRatings: number[]; // sliding window: last 10 ratings
}

export interface DailyActivity {
  dateKey: string;         // local-date 'YYYY-MM-DD'
  // existence of row = active that day
}
```

New Dexie tables in `src/lib/db/local.ts` (schema version bump to 2):

```ts
class LocalDB extends Dexie {
  packages!: Table<StoredPackage, string>;
  verses!: Table<StoredVerse, [string, number]>;
  settings!: Table<StoredSetting, string>;
  // NEW
  progress!: Table<VerseProgress, string>;
  activity!: Table<DailyActivity, string>;

  constructor() {
    super('memscripture');
    this.version(1).stores({ /* existing */ });
    this.version(2).stores({
      packages: '&id, name',
      verses: '[package_id+no], package_id',
      settings: '&key',
      progress: '&id, packageId, bucket',
      activity: '&dateKey'
    });
  }
}
```

Active package is a single row in the existing `settings` table:
- key `active_package` → `{ packageId: string, setAt: number }`

Sliding-window cap of 10 per axis: keeps recent-history priority calculations bounded and simple. Last 10 reviews of two axes per Old card = 20 numbers per card. With ~hundreds of Old cards, this is trivially small even with sync.

## Architecture

### Module split

Pure logic separated from I/O so it's testable without a DB:

- `src/lib/srs/buckets.ts` — pure: bucket transition rules, eligibility checks
- `src/lib/srs/scheduler.ts` — pure: `buildTodayQueue(progress, activity, today) → VerseProgress[]`
- `src/lib/srs/oldWindow.ts` — pure: `selectOldActiveWindow(allOld) → VerseProgress[]`, `priorityScore(p)`
- `src/lib/srs/intake.ts` — pure: `recommendNext(packageVerses, progress) → verseNo | null`
- `src/lib/db/progress.ts` — Dexie I/O: read/write VerseProgress; batch ops; bucket transitions
- `src/lib/db/activity.ts` — Dexie I/O: `markActiveToday()`, `daysActiveSince(timestamp)`
- `src/lib/db/activePackage.ts` — Dexie I/O: get/set active package (single-row pattern, like recent.ts)
- `src/lib/components/srs/RatingButtons.svelte` — 4-button row (Again/Hard/Good/Easy)
- `src/lib/components/srs/ReviewCard.svelte` — single-card review state machine (3 stages)
- `src/lib/components/srs/BucketBadge.svelte` — small dot/icon per bucket
- `src/routes/+page.svelte` — Today hero updated
- `src/routes/today/+page.svelte` — full review session screen (NEW)
- `src/routes/today/+page.ts` — `load()` builds the queue
- `src/routes/library/[packageId]/+page.svelte` — bucket indicators in row, active-package toggle, bulk-mastered menu
- `src/routes/library/[packageId]/[verseNo]/+page.svelte` — bucket badge, "이미 외움" / "다시 학습" buttons

Why pure modules: the scheduler and Old window selection are easy to get wrong (off-by-one, time zones, edge cases). Pure functions with table-driven tests catch issues fast. I/O modules are thin wrappers; persistence bugs surface as I/O test failures, not logic bugs.

### Today queue composition

```ts
// scheduler.ts (sketch)
export function buildTodayQueue(
  progress: VerseProgress[],
  activityHistory: DailyActivity[],
  todayKey: string
): VerseProgress[] {
  // 1. Auto-graduate eligible cards before composing the queue
  for (const p of progress) {
    if (shouldGraduate(p)) advanceBucket(p); // pure transition
  }

  // 2. New: every card, every active day
  const newCards = progress.filter(p => p.bucket === 'new');

  // 3. Current: 4–6 cards per day on a 3-day rotation
  // Use stable hash of (verseId + activityDay % 3) so the rotation is
  // deterministic and each card hits ~every 3rd active day.
  const currentCards = progress
    .filter(p => p.bucket === 'current')
    .filter(p => rotationSlot(p, activityHistory) === activityHistory.length % 3);

  // 4. Old: 1–2 from the active 12-window
  const oldWindow = selectOldActiveWindow(progress.filter(p => p.bucket === 'old'));
  const oldCards = pickOldSurface(oldWindow, activityHistory.length);

  return [...newCards, ...currentCards, ...oldCards];
}
```

### Time graduation (activity-based)

```ts
// buckets.ts
export const NEW_DURATION_DAYS = 7;
export const CURRENT_DURATION_DAYS = 42;

export function shouldGraduate(p: VerseProgress): boolean {
  if (p.bucket === 'new') return p.daysActiveInBucket >= NEW_DURATION_DAYS;
  if (p.bucket === 'current') return p.daysActiveInBucket >= CURRENT_DURATION_DAYS;
  return false; // old → mastered is manual
}

export function advanceBucket(p: VerseProgress): VerseProgress {
  // returns new state, never mutates
  const nextBucket: Bucket =
    p.bucket === 'new' ? 'current' :
    p.bucket === 'current' ? 'old' :
    p.bucket;
  return {
    ...p,
    bucket: nextBucket,
    enteredBucketAt: Date.now(),
    daysActiveInBucket: 0
  };
}
```

`daysActiveInBucket` increments at most once per local date, when the user submits any rating. The increment runs in `progress.ts` as part of the rating-write transaction.

### Old priority surfacing

```ts
// oldWindow.ts
export function priorityScore(p: VerseProgress): number {
  // Lower score = higher surface priority.
  // Cards with no recent ratings are surfaced first (priority = 0).
  const recent = [...p.citeRatings.slice(-5), ...p.recallRatings.slice(-5)];
  if (recent.length === 0) return 0;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function selectOldActiveWindow(allOld: VerseProgress[]): VerseProgress[] {
  return [...allOld]
    .sort((a, b) => priorityScore(a) - priorityScore(b) || a.lastReviewedAt - b.lastReviewedAt)
    .slice(0, 12);
}
```

Tie-break by `lastReviewedAt` (oldest first) ensures fair rotation.

### Activity tracking

```ts
// activity.ts
export async function markActiveToday(): Promise<void> {
  const dateKey = todayLocalKey();
  await db.activity.put({ dateKey });
}
```

Idempotent (same dateKey overwrites). Called from any rating submission. Time zone is device-local; spec acknowledges that traveling across midnight may merge two natural days into one (acceptable for v1).

## UI Changes Summary

| Page | Change |
|---|---|
| `/` (home) | Hero re-skinned to show queue stats; CTA → `/today` |
| `/today` (NEW) | Full review session: cycles through queue, shows ReviewCard for each |
| `/library` | Unchanged |
| `/library/[packageId]` | Add BucketBadge per row + "학습 중으로" + "전체 외움 표시" overflow menu |
| `/library/[packageId]/[verseNo]` | Add bucket badge, "이미 외움" / "다시 학습" controls |
| `/settings` | Still stub; bucket size customization deferred |

## Error Handling

- **Missing/corrupt progress row** → treat as `bucket: 'none'` (unmemorized). No exception thrown.
- **No active package** → home shows "학습을 시작하세요" + recommended-package card. `/today` shows empty state.
- **Rating submit fails** (Dexie error) → optimistic UI advances; the failed rating is queued in memory; on persistent fail (e.g., 3 retries), show toast and re-stack the card. Sliding-window writes are cheap to retry.
- **Schema migration** (v1 → v2) → Dexie handles structural migration; new tables start empty. No data loss for existing packages/verses/settings.
- **Timezone drift mid-day** → use `Intl.DateTimeFormat` + 'Asia/Seoul' for date keys initially. Document and revisit when sync ships.

## Testing

### Unit (Vitest, fake-indexeddb)

- `buckets.test.ts`
  - `shouldGraduate`: New requires 7 days, Current requires 42, Old never; mastered never
  - `advanceBucket`: transitions; resets `enteredBucketAt` and `daysActiveInBucket`; immutable
- `oldWindow.test.ts`
  - `priorityScore`: empty history → 0 (top priority); high ratings → high score (low priority); tie-break by lastReviewedAt
  - `selectOldActiveWindow`: caps at 12; deterministic order
- `scheduler.test.ts`
  - All-New state: queue is just New cards
  - Mixed buckets: queue includes correct counts; Current rotates
  - Auto-graduation runs before queue composition
  - Empty progress: empty queue
- `intake.test.ts`
  - Skips already-memorized verses
  - Returns null when package fully memorized
  - Orders by verseNo ascending
- `progress.test.ts`
  - Round-trip read/write VerseProgress
  - Sliding-window cap (push 11 → keep last 10)
  - Schema v1 → v2 migration: existing data preserved
- `activity.test.ts`
  - `markActiveToday` is idempotent within a day
  - `daysActiveSince(timestamp)` counts distinct local-date entries

### Component (testing-library/svelte)

- `RatingButtons.test.ts` — emits 1/2/3/4 for Again/Hard/Good/Easy
- `ReviewCard.test.ts` — sequential stages: citation → cite-rating → first-clause → recall-rating → full-text; title hint toggles
- `BucketBadge.test.ts` — renders correct visual per bucket

### E2E (Playwright)

- New user flow: open home → tap recommendation → first verse becomes New → complete review → next session shows graduated stats
- Mark whole package memorized: bulk action → verse list shows mastered indicators; queue empty unless other packages active
- Active package switch: verse from old active stays in queue; new active recommendations come from new package

## Out of Scope (Deferred)

- **Voice checking** (Phase 3.5+) — design already aligned: 4-step rating maps to latency × accuracy
- **Auth + sync** (Phase 4-5) — schema is sync-friendly (per-row updates, idempotent activity)
- **Stats / streak / heatmap** (Phase 6) — `activity` table is the foundation; visualization deferred
- **Configurable bucket sizes** — fixed 2-12-12 for v1, settings-ize later
- **Notifications / scheduled reminders** (Phase 7 with PWA)
- **Demotion** (failing card moves backward) — not in v1; preserves user trust in time-based predictability. Reconsider after first month of real use.
- **Cross-axis weighting** (cite vs recall) — flat sum for v1; tune if data suggests asymmetry
- **Master review re-loop** (long-term spaced reviews of mastered verses) — Phase 6 extension

## Open Items Settled During Implementation

These didn't surface as critical brainstorming forks but will be settled in the impl plan:

- Exact 3-day rotation formula for Current (likely `(verseIndex + activityIndex) % 3 === 0`)
- Per-stage transition animation in ReviewCard (likely none / instant for first cut)
- Empty-state copy variants
- Recommendation tie-breaking when verseNo is non-contiguous
- Whether `[학습 시작]` is a single tap or requires confirmation
