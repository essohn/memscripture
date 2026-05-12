# Phase 3.2 — Today Page, ReviewCard, and Intake — Design Spec

**Date:** 2026-05-12
**Status:** Draft → User review
**Scope:** End-to-end shippable Phase 3.2. Wires the Phase 3.1 SRS engine into a real user flow: home hero shows the daily queue, `/library/[packageId]` lets the user pick an active package, `/today` cycles through review cards plus intake suggestions, and the engine auto-graduates buckets on each session load. After this phase a user can install the app, pick a package, and start daily memorization with no further configuration.

**Builds on:** [Phase 3.1 SRS Spec](./2026-05-10-srs-memorization-system-design.md) — types, Dexie tables, pure SRS modules.

## Goal

Phase 3.1 delivered the SRS engine in isolation (pure logic + I/O modules + tests) with no user-facing surface. Phase 3.2 connects that engine to three thin UI surfaces — `home`, `library/[packageId]`, and a new `/today` — so a first-time user can go from "install" → "first verse in New bucket" → "first review session" in under a minute, and a returning user has a single 5-minute daily flow.

The phase is intentionally **integrated and shippable**, not incremental. A queue-display-only Phase 3.2 with no intake would have nothing to display; a review-screen-only Phase 3.2 with no entry point would be unreachable. Library-page bucket badges and richer admin UI are deferred to Phase 3.3+.

## Vision

```
First-time user (no active package)
   │
   │  Home empty state:
   │  ┌───────────────────────────────┐
   │  │ 학습할 패키지를 골라보세요    │
   │  │ [라이브러리로 →]              │
   │  └───────────────────────────────┘
   │
   ▼
/library → tap package → /library/[packageId]
   │
   │  Activation control:
   │  [이 패키지로 학습 시작]   ← new button on package page header
   │       ↓ tap
   │  Confirmation banner:
   │  "활성 패키지로 설정되었어요. [오늘의 큐 →]"
   │
   ▼
/today  (queue = 0 review cards + 2 suggestion cards)
   │
   │  Card 1/2 — Suggestion variant:
   │  ┌───────────────────────────────┐
   │  │   고후 5:17                    │
   │  │   중심되신 그리스도            │
   │  │   그런즉 누구든지 그리스도…    │  ← first-clause preview
   │  │                               │
   │  │   [학습 시작]  [Skip]          │
   │  └───────────────────────────────┘
   │       ↓ tap "학습 시작"
   │  upsertProgress(bucket='new') + advance to card 2/2
   │
   ▼
Card 2/2 — second suggestion → commit → 🎉 "오늘은 다 했어요"


Returning user (active package, cards to review)
   │
   │  Home hero:
   │  ┌───────────────────────────────┐
   │  │ ✨ 오늘                        │
   │  │ 5장 남음                      │
   │  │ 새 2 · 복습 3                  │
   │  │            [시작 →]            │
   │  └───────────────────────────────┘
   │
   ▼
/today  (5 review cards + 0 suggestions)
   │
   │  Card 1/5 — Review variant, Stage 1 (citation only)
   │  ┌───────────────────────────────┐
   │  │           고후 5:17             │
   │  │                               │
   │  │      [Title 힌트 보기]         │  ← optional
   │  │                               │
   │  │           [구절 보기 →]         │
   │  └───────────────────────────────┘
   │       ↓ tap "구절 보기"
   │
   │  Stage 2 (first clause + cite rating)
   │  ┌───────────────────────────────┐
   │  │           고후 5:17             │
   │  │   그런즉 누구든지 그리스도      │
   │  │   안에 있으면                   │
   │  │                               │
   │  │ [Again][Hard][Good][Easy]     │  ← cite axis
   │  └───────────────────────────────┘
   │       ↓ tap rating
   │
   │  Stage 3 (full text + recall rating)
   │  ┌───────────────────────────────┐
   │  │ 그런즉 누구든지 그리스도 안에  │
   │  │ 있으면 새로운 피조물이라 …      │
   │  │                               │
   │  │ [Again][Hard][Good][Easy]     │  ← recall axis
   │  └───────────────────────────────┘
   │       ↓ tap rating → next card
   │
   ▼
After last card: done screen
   ┌───────────────────────────────┐
   │ 🎉 오늘은 다 했어요             │
   │ 평가 5장 · 신규 2장             │
   │ [홈으로]                        │
   └───────────────────────────────┘
```

## User Experience

### Home (`/`)

Home hero has three visual states:

**State A — No active package** (first-time user)
- Hero title: "학습할 패키지를 골라보세요"
- Hero body: brief explanation
- CTA: `[라이브러리로 →]`

**State B — Active package + queue has items**
- Hero title: "오늘"
- Stats row: `N장 남음` + `새 X · 복습 Y` breakdown
- CTA: `[시작 →]` linking to `/today`

**State C — Active package + queue empty**
- Variant C1: queue done today → "🎉 오늘은 다 했어요" + next-up preview if any
- Variant C2: package fully memorized → "이 패키지를 다 외웠어요" + `[라이브러리로]`
- Variant C3: queue empty but slots have suggestions → "추천 구절이 있어요" + `[시작 →]` (links to /today which shows suggestions)

The "최근 패키지" section below the hero is preserved as-is.

### Library package detail (`/library/[packageId]`)

Add one new control to the existing page header:

- If current package === active package: status pill `학습 중`
- Else: `[이 패키지로 학습 시작]` button

Tapping the activation button:
1. `setActivePackage(packageId)`
2. Shows transient banner (3 seconds): "활성 패키지로 설정되었어요. [오늘의 큐 →]"
3. The banner's CTA navigates to `/today`. The page itself stays put — no auto-navigation.

The verse list below is unchanged. Per-row bucket badges are deferred to Phase 3.3.

### Today (`/today`) — NEW

Single full-screen flow, one card at a time.

**Page structure**
```
Header (back to home, queue progress "N/M")
  ↓
Card area (full width, centered)
  - ReviewCard (review or suggestion variant)
  ↓
Card footer (varies by variant + stage):
  - Review Stage 1: [Title 힌트 보기] (optional) + [구절 보기 →]
  - Review Stage 2 or 3: RatingButtons row (4 buttons)
  - Suggestion: [학습 시작] + [Skip]
```

**Queue order**
1. All cards from `buildTodayQueue(progress, activity)` — already ordered by bucket (New first, then Current rotation, then Old surface)
2. Then suggestion entries for empty New slots (max 2 - count_of_active_new)

**Done screen** (after last card)
- Heading: "🎉 오늘은 다 했어요"
- Summary: count of cards rated today + cards added today
- CTA: `[홈으로]`

**Empty queue** (zero items including suggestions)
- Means active package fully mastered or all New slots full but nothing to review today
- Show appropriate state (likely just done screen with different copy)

### Card variants

**Review variant — 3 stages**

Stage 1 — Recognition prompt
- Shown: large citation (e.g., "고후 5:17"), centered
- Optional: `[Title 힌트 보기]` button → reveals title beneath citation when tapped
- CTA: `[구절 보기 →]` advances to Stage 2

Stage 2 — First-clause reveal + cite rating
- Shown: citation + first clause (from `extractFirstClause(verse.w)`)
- Rating: `[Again] [Hard] [Good] [Easy]` (cite axis)
- Tap → call `pushRating(packageId, verseNo, 'cite', score)` → advance to Stage 3

Stage 3 — Full text + recall rating
- Shown: citation + full `verse.w`
- Rating: `[Again] [Hard] [Good] [Easy]` (recall axis)
- Tap → `pushRating(packageId, verseNo, 'recall', score)` → next card

**Suggestion variant — single stage**

Pre-commit preview
- Shown: citation + title + first-clause preview
- Buttons: `[학습 시작]` (primary) + `[Skip]` (secondary)
- `[학습 시작]` → create new VerseProgress with `bucket='new'`, `enteredBucketAt=now`, `daysActiveInBucket=0`, empty ratings → next card
- `[Skip]` → next card (same verse may resurface tomorrow)

## Data Model

Single additive change to `VerseProgress` (no schema migration needed — Dexie tolerates new fields on existing rows):

```ts
export interface VerseProgress {
  // ... existing fields ...
  /** 'YYYY-MM-DD' of the last day the user reviewed this card.
   * Drives daysActiveInBucket increment (at most once per local date). */
  lastActiveDayKey?: string;
}
```

Existing rows have `lastActiveDayKey === undefined`, which `pushRating` treats as "first review today" → increments and stamps the field.

## Architecture

### New files

```
src/lib/srs/firstClause.ts          — extractFirstClause(text, override?) heuristic
src/lib/srs/orchestrate.ts          — applyGraduations(progress) (pure)
src/lib/srs/suggestions.ts          — buildSuggestions(progress, packageVerses) (pure)
src/lib/components/srs/ReviewCard.svelte         — 3-stage card with two variants
src/lib/components/srs/RatingButtons.svelte      — 4-button row, emits 1-4
src/lib/components/srs/QueueProgress.svelte      — "N/M" or dots indicator
src/routes/today/+page.ts            — load() composes queue + orchestrates
src/routes/today/+page.svelte        — review session UI
tests/unit/firstClause.test.ts
tests/unit/orchestrate.test.ts
tests/unit/suggestions.test.ts
tests/unit/RatingButtons.test.ts
tests/unit/ReviewCard.test.ts
tests/e2e/today.spec.ts              — E2E covering first-user and daily flows
```

### Modified files

```
src/routes/+page.svelte                            — home hero: SRS-aware states
src/routes/library/[packageId]/+page.svelte        — activation button + banner
src/lib/types.ts                                   — add lastActiveDayKey to VerseProgress
src/lib/db/progress.ts                             — pushRating increments daysActiveInBucket on day change
tests/unit/progress.test.ts                        — extend coverage for day increment
```

### Why this split

- **Pure** `firstClause.ts`, `orchestrate.ts`, `suggestions.ts` — no Dexie. Easy unit tests, no fake-indexeddb needed.
- **`load()` in `today/+page.ts`** is the only place where pure logic + Dexie I/O are composed. This keeps the orchestration testable end-to-end via the page's data flow.
- **`ReviewCard`** has a single responsibility: render one card in the right variant/stage and emit events. Parent (`/today/+page.svelte`) owns the queue cursor and dispatches `pushRating` / `upsertProgress`.
- **`RatingButtons`** is decoupled — used by both review stages. Easy to swap in alternative input later (voice, slider, etc.).

## Key Algorithms

### First-clause extraction

```ts
// src/lib/srs/firstClause.ts
export function extractFirstClause(text: string, override?: string): string {
  if (override) return override;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const count = Math.min(Math.max(Math.ceil(tokens.length / 3), 3), 8);
  return tokens.slice(0, Math.min(count, tokens.length)).join(' ');
}
```

Properties:
- Empty string returns empty (no error)
- Single-word verse returns that word (count clamps down)
- Long verse returns at most 8 어절 (prevents giveaway)
- Short verse (< 9 어절) returns at least 3 어절 (or whole thing if fewer)
- `override` enables future `v.first_clause` data field — call sites pass `verse.first_clause` if present

Examples (target behavior, locked in tests):
- "그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다" (15) → 5 어절 → "그런즉 누구든지 그리스도 안에 있으면" ✓
- "여호와는 나의 목자시니 내가 부족함이 없으리로다" (7) → 3 어절 → "여호와는 나의 목자시니"
- "내가 산을 향하여 눈을 들리라" (5) → 3 어절 → "내가 산을 향하여"

### Auto-graduation orchestration

```ts
// src/lib/srs/orchestrate.ts
import { shouldGraduate, advanceBucket } from './buckets';

export interface GraduationResult {
  /** Cards whose bucket changed in this pass — caller must persist these. */
  graduated: VerseProgress[];
  /** Full progress list post-graduation. Use this for queue building. */
  current: VerseProgress[];
}

export function applyGraduations(progress: VerseProgress[]): GraduationResult {
  const graduated: VerseProgress[] = [];
  const current: VerseProgress[] = [];
  for (const p of progress) {
    if (shouldGraduate(p)) {
      const next = advanceBucket(p);
      graduated.push(next);
      current.push(next);
    } else {
      current.push(p);
    }
  }
  return { graduated, current };
}
```

Pure (no Dexie). Caller is responsible for persisting `graduated` and using `current` for queue composition.

### Suggestion building

```ts
// src/lib/srs/suggestions.ts
import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';
import { recommendNext } from './intake';

const NEW_SLOT_CAPACITY = 2;

export interface SuggestionEntry {
  packageId: string;
  verseNo: number;
}

/** Returns 0–2 verse numbers to suggest filling empty New slots in the active package. */
export function buildSuggestions(
  progress: VerseProgress[],
  packageVerses: StoredVerse[]
): SuggestionEntry[] {
  const activeNewCount = progress.filter((p) => p.bucket === 'new').length;
  const slotsToFill = Math.max(0, NEW_SLOT_CAPACITY - activeNewCount);
  if (slotsToFill === 0) return [];
  const out: SuggestionEntry[] = [];
  // Build a synthetic "memorized" set that includes already-suggested verses
  // so a second slot doesn't recommend the same verse.
  let extendedProgress = [...progress];
  for (let i = 0; i < slotsToFill; i++) {
    const next = recommendNext(packageVerses, extendedProgress);
    if (next === null) break;
    out.push({ packageId: packageVerses[0]?.package_id ?? '', verseNo: next });
    // pretend this verse is in 'new' bucket so recommendNext skips it next pass
    extendedProgress = [
      ...extendedProgress,
      {
        id: `${packageVerses[0]!.package_id}:${next}`,
        packageId: packageVerses[0]!.package_id,
        verseNo: next,
        bucket: 'new',
        enteredBucketAt: 0,
        daysActiveInBucket: 0,
        lastReviewedAt: 0,
        citeRatings: [],
        recallRatings: []
      }
    ];
  }
  return out;
}
```

Pure. Returns 0, 1, or 2 suggestions depending on how many New slots are open and how many unmemorized verses remain in the active package.

### `daysActiveInBucket` increment in `pushRating`

```ts
// src/lib/db/progress.ts (extended)
import { todayLocalKey } from './activity';

export async function pushRating(...): Promise<void> {
  // ... existing validation ...
  await db.transaction('rw', db.progress, async () => {
    const existing = await db.progress.get(id);
    if (!existing) return;

    const today = todayLocalKey();
    const isFirstReviewToday = existing.lastActiveDayKey !== today;

    const key = axis === 'cite' ? 'citeRatings' : 'recallRatings';
    const next = [...existing[key], score].slice(-RATING_WINDOW);

    await db.progress.put({
      ...existing,
      [key]: next,
      lastReviewedAt: Date.now(),
      lastActiveDayKey: today,
      daysActiveInBucket: isFirstReviewToday
        ? existing.daysActiveInBucket + 1
        : existing.daysActiveInBucket
    });
  });
}
```

Property: Within a single local date, `daysActiveInBucket` increments at most once (on the first rating); subsequent ratings on the same date only update ratings and `lastReviewedAt`.

### `/today` load() orchestration

```ts
// src/routes/today/+page.ts
import { redirect } from '@sveltejs/kit';
import { getActivePackageId } from '$lib/db/activePackage';
import { listProgressByPackage } from '$lib/db/progress';
import { listVerses } from '$lib/db/verses';
import { applyGraduations } from '$lib/srs/orchestrate';
import { upsertProgress } from '$lib/db/progress';
import { getActivityHistory, markActiveToday } from '$lib/db/activity';
import { buildTodayQueue } from '$lib/srs/scheduler';
import { buildSuggestions } from '$lib/srs/suggestions';

export const load = async () => {
  const activeId = await getActivePackageId();
  if (!activeId) throw redirect(307, '/');

  const [rawProgress, packageVerses, activity] = await Promise.all([
    listProgressByPackage(activeId),
    listVerses(activeId),
    getActivityHistory()
  ]);

  // 1. Apply pending graduations and persist them.
  const { graduated, current } = applyGraduations(rawProgress);
  for (const g of graduated) await upsertProgress(g);

  // 2. Mark today as active. (Side effect: future loads see today in activity history.)
  await markActiveToday();

  // 3. Build queue and append suggestions.
  const queue = buildTodayQueue(current, activity);
  const suggestions = buildSuggestions(current, packageVerses);

  return { activeId, queue, suggestions, packageVerses };
};
```

`/today/+page.svelte` consumes `data` and walks the queue + suggestions sequentially.

## Error Handling

- **No active package** in `/today/+page.ts` → redirect to `/`. Home shows the empty state with library CTA.
- **Active package not installed in Dexie** (data file missing) → `listVerses` returns []. Suggestions empty. Queue may still have stale progress rows — those render with empty content (graceful degradation). Logging via console.warn.
- **`pushRating` fails** (Dexie error) → handled at component level: optimistic UI advances; if persistence rejects, show a transient toast and re-stack the card.
- **Race on rapid rating taps** — `pushRating` is now transactional (Phase 3.1 fix). Multiple taps on the same card don't lose ratings.
- **Mid-session navigation away** — session state is unsaved; user reopens `/today` and starts at queue position 0 of the freshly-built queue. This is acceptable for v1; resume-mid-session is YAGNI.

## Testing

### Unit (Vitest)

**`firstClause.test.ts`** (pure, no Dexie)
- Empty string → empty
- Single word → that word
- 7 words → 3 (min)
- 15 words → 5 (33%)
- 30 words → 8 (max)
- Multiple whitespace handled
- Override returned verbatim regardless of text

**`orchestrate.test.ts`** (pure)
- Empty input → empty result
- All non-graduating cards → graduated empty, current same
- Mixed: graduates only those past threshold
- `current` array preserves order; `graduated` contains only changed cards

**`suggestions.test.ts`** (pure)
- 0 active New, 60 unmemorized verses → 2 suggestions
- 1 active New, 60 unmemorized → 1 suggestion
- 2 active New → 0 suggestions
- Fully memorized package → 0 suggestions
- Two suggestions are distinct verses (no duplicate recommendation)

**`progress.test.ts`** extension
- `pushRating` on a fresh card sets `lastActiveDayKey` and increments `daysActiveInBucket`
- Two `pushRating` calls on the same local date → `daysActiveInBucket` increments once
- `pushRating` on the next local date (mock `todayLocalKey`) → increments again

### Component (testing-library/svelte)

**`RatingButtons.test.ts`**
- Renders 4 buttons
- Each emits 1/2/3/4 respectively
- Keyboard focusable

**`ReviewCard.test.ts`**
- Review variant Stage 1: shows citation, no first clause, no rating
- Stage 1 → 2 transition on "구절 보기" tap
- Stage 2: shows first clause + rating buttons; tap emits `{ axis: 'cite', score: N }`
- Stage 2 → 3 transition on rating tap
- Stage 3: shows full text + rating buttons; tap emits `{ axis: 'recall', score: N }`
- Title hint button toggles title visibility in Stage 1
- Suggestion variant: shows citation + title + first-clause preview + [학습 시작] + [Skip]
- Suggestion `[학습 시작]` emits `commit`
- Suggestion `[Skip]` emits `skip`

### E2E (Playwright) — `tests/e2e/today.spec.ts`

- First-user flow: `/library/60_krv` → activate → banner appears → tap CTA → `/today` shows suggestion card → tap "학습 시작" → second suggestion → done screen
- Daily flow: seed Dexie with one New card → `/today` → Stage 1 → "구절 보기" → Stage 2 → rating → Stage 3 → rating → done
- Empty active package: clear active → visit `/today` → redirected to `/`

## Out of Scope

- **Library/verse-detail bucket badges** — Phase 3.3 (visual indicator per verse row)
- **"이 패키지 전체 외움" bulk action** — Phase 3.3
- **"이미 외움" per-verse mark** — Phase 3.3
- **Voice checking** — Phase 3.5+
- **Stats / streak / heatmap visualization** — Phase 6
- **Auth + sync** — Phase 4-5
- **Notifications / scheduled reminders** — Phase 7
- **Mid-session resume** — not in v1 (queue rebuilt fresh each time)
- **Card demotion** (failing a card moves backward a bucket) — not in v1
- **`v.first_clause` annotated data** — heuristic is sufficient; the `override` parameter is the seam for future migration

## Open Items Settled During Implementation

- Exact icon for the Stage 1 → 2 CTA (`→` vs lucide icon)
- Transient banner timing on `/library/[packageId]` (3s default; tunable)
- Done-screen summary copy variants
- Loading state during `load()` (likely just SvelteKit's default; data is fast)
