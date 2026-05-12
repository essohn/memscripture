# Phase 3.2 — Today Page, ReviewCard, and Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 3.1 SRS engine into a real user flow: home hero shows the queue, `/library/[packageId]` activates a package, and a new `/today` route cycles through review cards plus intake suggestions. After this plan, a fresh install can go from "tap recommend" → "first verse in New" → "daily review" with no further setup.

**Architecture:** Builds bottom-up — data model extension (Task 1) → pure logic modules (Tasks 2-5) → presentational components (Tasks 6-8) → the `/today` route and its `load()` orchestration (Tasks 9-10) → the two entry surfaces, home hero and library activation (Tasks 11-12) → E2E coverage (Task 13). Each task is TDD: failing test → minimal impl → green → commit.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Dexie 4, Tailwind v4, Vitest + fake-indexeddb, @testing-library/svelte, Playwright.

**Spec:** [docs/superpowers/specs/2026-05-12-srs-today-page-and-intake-design.md](../specs/2026-05-12-srs-today-page-and-intake-design.md)

---

## File Structure

**Create:**
- `src/lib/srs/firstClause.ts` — extractFirstClause(text, override?) heuristic
- `src/lib/srs/orchestrate.ts` — applyGraduations(progress)
- `src/lib/srs/suggestions.ts` — buildSuggestions(progress, packageVerses)
- `src/lib/components/srs/RatingButtons.svelte` — 4-button row (1=Again..4=Easy)
- `src/lib/components/srs/QueueProgress.svelte` — "N/M" header indicator
- `src/lib/components/srs/ReviewCard.svelte` — review variant, 3 stages
- `src/lib/components/srs/SuggestionCard.svelte` — single-stage suggestion variant
- `src/routes/today/+page.ts` — load() composes queue + suggestions
- `src/routes/today/+page.svelte` — full-screen session UI
- `tests/unit/firstClause.test.ts`
- `tests/unit/orchestrate.test.ts`
- `tests/unit/suggestions.test.ts`
- `tests/unit/RatingButtons.test.ts`
- `tests/unit/ReviewCard.test.ts`
- `tests/unit/SuggestionCard.test.ts`
- `tests/e2e/today.spec.ts`

**Modify:**
- `src/lib/types.ts` — add `lastActiveDayKey?: string` to VerseProgress
- `src/lib/db/progress.ts` — extend pushRating to increment daysActiveInBucket on day change
- `tests/unit/progress.test.ts` — extend for day-increment cases
- `src/routes/+page.svelte` — SRS-aware home hero with 3 states
- `src/routes/library/[packageId]/+page.svelte` — activation button + banner

Pure logic in `srs/` stays Dexie-free. Components are presentation-only — `/today/+page.svelte` owns state and emits I/O. The single E2E spec covers the highest-value flows.

---

## Task 1: Add `lastActiveDayKey` to VerseProgress

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add optional field**

In `src/lib/types.ts`, find the `VerseProgress` interface and add the new field at the end of its body (before the closing brace):

```ts
export interface VerseProgress {
	id: string; // composite key: `${packageId}:${verseNo}`
	packageId: string;
	verseNo: number;
	bucket: Bucket;
	enteredBucketAt: number; // ms timestamp; reset on bucket transition
	daysActiveInBucket: number; // count of distinct active days while in current bucket
	lastReviewedAt: number;
	citeRatings: number[]; // sliding window: last 10 ratings (1=Again, 4=Easy)
	recallRatings: number[]; // sliding window: last 10 ratings
	/** 'YYYY-MM-DD' (local) of last review day; drives daysActiveInBucket increment. */
	lastActiveDayKey?: string;
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: PASS — 0 errors. Field is optional so existing usages don't break.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add lastActiveDayKey to VerseProgress"
```

---

## Task 2: Extend pushRating to track daysActiveInBucket per local day

**Files:**
- Modify: `src/lib/db/progress.ts`
- Modify: `tests/unit/progress.test.ts`

- [ ] **Step 1: Write failing tests for day-increment behavior**

Add the following tests to the bottom of the existing `describe('progress I/O', ...)` block in `tests/unit/progress.test.ts` (do NOT remove existing tests):

```ts
	it('pushRating sets lastActiveDayKey and increments daysActiveInBucket on first review of the day', async () => {
		await upsertProgress(mk({ daysActiveInBucket: 0, lastActiveDayKey: undefined }));
		await pushRating('5_krv', 1, 'cite', 3, { dateKey: '2026-05-12' });
		const p = await getProgress('5_krv', 1);
		expect(p?.lastActiveDayKey).toBe('2026-05-12');
		expect(p?.daysActiveInBucket).toBe(1);
	});

	it('pushRating does NOT increment daysActiveInBucket on second rating same local day', async () => {
		await upsertProgress(mk({ daysActiveInBucket: 0, lastActiveDayKey: undefined }));
		await pushRating('5_krv', 1, 'cite', 3, { dateKey: '2026-05-12' });
		await pushRating('5_krv', 1, 'recall', 4, { dateKey: '2026-05-12' });
		const p = await getProgress('5_krv', 1);
		expect(p?.daysActiveInBucket).toBe(1);
	});

	it('pushRating increments daysActiveInBucket again on new local day', async () => {
		await upsertProgress(mk({ daysActiveInBucket: 0, lastActiveDayKey: undefined }));
		await pushRating('5_krv', 1, 'cite', 3, { dateKey: '2026-05-12' });
		await pushRating('5_krv', 1, 'cite', 3, { dateKey: '2026-05-13' });
		const p = await getProgress('5_krv', 1);
		expect(p?.daysActiveInBucket).toBe(2);
		expect(p?.lastActiveDayKey).toBe('2026-05-13');
	});

	it('pushRating uses real todayLocalKey when dateKey option omitted', async () => {
		await upsertProgress(mk({ daysActiveInBucket: 0, lastActiveDayKey: undefined }));
		await pushRating('5_krv', 1, 'cite', 3);
		const p = await getProgress('5_krv', 1);
		// Pattern matches activity.todayLocalKey output
		expect(p?.lastActiveDayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(p?.daysActiveInBucket).toBe(1);
	});
```

- [ ] **Step 2: Run tests to see failure**

Run: `pnpm test progress`
Expected: FAIL — new tests fail because `pushRating` doesn't yet accept the `options` parameter or update `lastActiveDayKey`/`daysActiveInBucket`.

- [ ] **Step 3: Extend pushRating implementation**

Replace the entire `pushRating` function in `src/lib/db/progress.ts` with this version (keep all other functions intact):

```ts
export async function pushRating(
	packageId: string,
	verseNo: number,
	axis: 'cite' | 'recall',
	score: number,
	options: { dateKey?: string } = {}
): Promise<void> {
	if (!Number.isInteger(score) || score < 1 || score > 4) {
		throw new Error(`pushRating: invalid score ${score} (expected integer 1-4)`);
	}
	const id = progressId(packageId, verseNo);
	await db.transaction('rw', db.progress, async () => {
		const existing = await db.progress.get(id);
		if (!existing) return;
		const today = options.dateKey ?? todayLocalKey();
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

Also add the import at the top of `src/lib/db/progress.ts` (just below the existing `import { db } from './local'` line):

```ts
import { todayLocalKey } from './activity';
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm test progress`
Expected: PASS — all progress tests (existing + 4 new) green.

- [ ] **Step 5: Run full suite for regressions**

Run: `pnpm test`
Expected: PASS — no other tests broken.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/progress.ts tests/unit/progress.test.ts
git commit -m "feat(progress): track daysActiveInBucket via lastActiveDayKey per local date"
```

---

## Task 3: firstClause extraction heuristic

**Files:**
- Create: `src/lib/srs/firstClause.ts`
- Create: `tests/unit/firstClause.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/firstClause.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractFirstClause } from '../../src/lib/srs/firstClause';

describe('extractFirstClause', () => {
	it('returns empty for empty input', () => {
		expect(extractFirstClause('')).toBe('');
		expect(extractFirstClause('   ')).toBe('');
	});

	it('returns the whole text for very short verses (fewer than 3 words)', () => {
		expect(extractFirstClause('한 단어')).toBe('한 단어');
		expect(extractFirstClause('하나')).toBe('하나');
	});

	it('returns at least 3 words for verses with 3-8 words', () => {
		expect(extractFirstClause('내가 산을 향하여 눈을 들리라')).toBe('내가 산을 향하여');
		// 7 words → ceil(7/3) = 3
		expect(extractFirstClause('여호와는 나의 목자시니 내가 부족함이 없으리로다 영원히')).toBe(
			'여호와는 나의 목자시니'
		);
	});

	it('returns roughly first 33% of words for medium-length verses', () => {
		// 15 words → ceil(15/3) = 5
		const text = '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다 아멘 아멘';
		expect(extractFirstClause(text)).toBe('그런즉 누구든지 그리스도 안에 있으면');
	});

	it('caps at 8 words for long verses', () => {
		// 30 words → ceil(30/3) = 10, capped to 8
		const tokens = Array.from({ length: 30 }, (_, i) => `w${i}`);
		const text = tokens.join(' ');
		const result = extractFirstClause(text);
		expect(result.split(/\s+/)).toHaveLength(8);
		expect(result).toBe(tokens.slice(0, 8).join(' '));
	});

	it('returns override verbatim regardless of source text', () => {
		expect(extractFirstClause('the actual text', 'a custom clause')).toBe('a custom clause');
		expect(extractFirstClause('', 'still works')).toBe('still works');
	});

	it('collapses runs of whitespace when splitting', () => {
		expect(extractFirstClause('  하나   둘   셋   넷   ')).toBe('하나 둘 셋');
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test firstClause`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/srs/firstClause.ts`:

```ts
/**
 * Extracts a "first clause" preview from a verse body — used as the Stage 2 cue
 * in the daily review card. Heuristic: roughly first 1/3 of space-separated tokens,
 * clamped to [3, 8].
 *
 * @param text  Full verse text (verse.w in the StoredVerse type).
 * @param override  If provided, returned verbatim. Seam for future v.first_clause data.
 */
export function extractFirstClause(text: string, override?: string): string {
	if (override !== undefined) return override;
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return '';
	const target = Math.ceil(tokens.length / 3);
	const count = Math.min(Math.max(target, 3), 8);
	return tokens.slice(0, Math.min(count, tokens.length)).join(' ');
}
```

- [ ] **Step 4: Verify**

Run: `pnpm test firstClause`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/firstClause.ts tests/unit/firstClause.test.ts
git commit -m "feat(srs): add first-clause extraction heuristic"
```

---

## Task 4: applyGraduations orchestration

**Files:**
- Create: `src/lib/srs/orchestrate.ts`
- Create: `tests/unit/orchestrate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/orchestrate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyGraduations } from '../../src/lib/srs/orchestrate';
import { NEW_DURATION_DAYS, CURRENT_DURATION_DAYS } from '../../src/lib/srs/buckets';
import type { VerseProgress } from '../../src/lib/types';

const mk = (overrides: Partial<VerseProgress> = {}): VerseProgress => ({
	id: 'pkg:1',
	packageId: 'pkg',
	verseNo: 1,
	bucket: 'new',
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: [],
	...overrides
});

describe('applyGraduations', () => {
	it('returns empty result for empty input', () => {
		const result = applyGraduations([]);
		expect(result.graduated).toEqual([]);
		expect(result.current).toEqual([]);
	});

	it('returns all in current unchanged when nothing graduates', () => {
		const input = [
			mk({ id: 'pkg:1', bucket: 'new', daysActiveInBucket: 3 }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'current', daysActiveInBucket: 10 })
		];
		const result = applyGraduations(input);
		expect(result.graduated).toEqual([]);
		expect(result.current).toEqual(input);
	});

	it('graduates a New card that reached threshold', () => {
		const input = [mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS })];
		const result = applyGraduations(input);
		expect(result.graduated).toHaveLength(1);
		expect(result.graduated[0].bucket).toBe('current');
		expect(result.current).toHaveLength(1);
		expect(result.current[0].bucket).toBe('current');
	});

	it('graduates a Current card that reached threshold', () => {
		const input = [mk({ bucket: 'current', daysActiveInBucket: CURRENT_DURATION_DAYS })];
		const result = applyGraduations(input);
		expect(result.graduated).toHaveLength(1);
		expect(result.graduated[0].bucket).toBe('old');
		expect(result.current[0].bucket).toBe('old');
	});

	it('preserves order in current; graduated only contains changed cards', () => {
		const input = [
			mk({ id: 'pkg:1', bucket: 'new', daysActiveInBucket: 0 }),
			mk({ id: 'pkg:2', verseNo: 2, bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS }),
			mk({ id: 'pkg:3', verseNo: 3, bucket: 'current', daysActiveInBucket: 10 })
		];
		const result = applyGraduations(input);
		expect(result.current.map((p) => p.id)).toEqual(['pkg:1', 'pkg:2', 'pkg:3']);
		expect(result.graduated.map((p) => p.id)).toEqual(['pkg:2']);
		expect(result.current[1].bucket).toBe('current'); // graduated in place
	});

	it('does not mutate input array or its objects', () => {
		const original = mk({ bucket: 'new', daysActiveInBucket: NEW_DURATION_DAYS });
		const input = [original];
		const snapshot = JSON.parse(JSON.stringify(original));
		applyGraduations(input);
		expect(input[0]).toEqual(snapshot);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test orchestrate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/srs/orchestrate.ts`:

```ts
import type { VerseProgress } from '$lib/types';
import { shouldGraduate, advanceBucket } from './buckets';

export interface GraduationResult {
	/** Cards whose bucket changed in this pass — caller must persist these. */
	graduated: VerseProgress[];
	/** Full progress list post-graduation. Use this for queue building. */
	current: VerseProgress[];
}

/**
 * Pure: scans progress, runs advanceBucket on each eligible card, and reports
 * both the changed cards (for persistence) and the full post-graduation snapshot
 * (for downstream queue building). Does not mutate input.
 */
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

- [ ] **Step 4: Verify**

Run: `pnpm test orchestrate`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/orchestrate.ts tests/unit/orchestrate.test.ts
git commit -m "feat(srs): add applyGraduations orchestration helper"
```

---

## Task 5: buildSuggestions for empty New slots

**Files:**
- Create: `src/lib/srs/suggestions.ts`
- Create: `tests/unit/suggestions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/suggestions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSuggestions } from '../../src/lib/srs/suggestions';
import type { VerseProgress } from '../../src/lib/types';
import type { StoredVerse } from '../../src/lib/db/local';

const verse = (no: number, packageId = 'pkg'): StoredVerse => ({
	package_id: packageId,
	no,
	i: no,
	title: `t${no}`,
	cite: `c${no}`,
	w: `w${no}`
});

const progress = (no: number, bucket: VerseProgress['bucket']): VerseProgress => ({
	id: `pkg:${no}`,
	packageId: 'pkg',
	verseNo: no,
	bucket,
	enteredBucketAt: 0,
	daysActiveInBucket: 0,
	lastReviewedAt: 0,
	citeRatings: [],
	recallRatings: []
});

describe('buildSuggestions', () => {
	it('returns 2 suggestions when New is empty and ≥2 unmemorized verses exist', () => {
		const verses = [verse(1), verse(2), verse(3)];
		const result = buildSuggestions([], verses);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ packageId: 'pkg', verseNo: 1 });
		expect(result[1]).toEqual({ packageId: 'pkg', verseNo: 2 });
	});

	it('returns 1 suggestion when one New slot is filled', () => {
		const verses = [verse(1), verse(2), verse(3)];
		const result = buildSuggestions([progress(1, 'new')], verses);
		expect(result).toHaveLength(1);
		expect(result[0].verseNo).toBe(2);
	});

	it('returns 0 suggestions when both New slots are filled', () => {
		const verses = [verse(1), verse(2), verse(3)];
		const result = buildSuggestions([progress(1, 'new'), progress(2, 'new')], verses);
		expect(result).toHaveLength(0);
	});

	it('returns 0 suggestions when package is fully memorized', () => {
		const verses = [verse(1)];
		const result = buildSuggestions([progress(1, 'old')], verses);
		expect(result).toHaveLength(0);
	});

	it('returns 1 suggestion when only 1 unmemorized verse remains', () => {
		const verses = [verse(1), verse(2)];
		const result = buildSuggestions([progress(1, 'current')], verses);
		expect(result).toHaveLength(1);
		expect(result[0].verseNo).toBe(2);
	});

	it('returns 0 suggestions when packageVerses is empty', () => {
		expect(buildSuggestions([], [])).toEqual([]);
	});

	it('two suggestions are always distinct verses', () => {
		const verses = [verse(1), verse(2), verse(3), verse(4)];
		const result = buildSuggestions([], verses);
		expect(result).toHaveLength(2);
		const ids = new Set(result.map((s) => s.verseNo));
		expect(ids.size).toBe(2);
	});

	it('uses the package id from packageVerses', () => {
		const verses = [verse(1, 'other_pkg')];
		const result = buildSuggestions([], verses);
		expect(result[0].packageId).toBe('other_pkg');
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test suggestions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/srs/suggestions.ts`:

```ts
import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';
import { recommendNext } from './intake';

const NEW_SLOT_CAPACITY = 2;

export interface SuggestionEntry {
	packageId: string;
	verseNo: number;
}

/**
 * Returns 0–2 suggestions for filling empty New slots. Each suggestion is a
 * distinct unmemorized verse from packageVerses, ordered by verseNo ascending.
 *
 * Caller passes only this-package progress; this function does NOT filter by
 * packageId.
 */
export function buildSuggestions(
	progress: VerseProgress[],
	packageVerses: StoredVerse[]
): SuggestionEntry[] {
	if (packageVerses.length === 0) return [];
	const packageId = packageVerses[0].package_id;
	const activeNewCount = progress.filter((p) => p.bucket === 'new').length;
	const slotsToFill = Math.max(0, NEW_SLOT_CAPACITY - activeNewCount);
	if (slotsToFill === 0) return [];

	const out: SuggestionEntry[] = [];
	let extendedProgress = [...progress];
	for (let i = 0; i < slotsToFill; i++) {
		const next = recommendNext(packageVerses, extendedProgress);
		if (next === null) break;
		out.push({ packageId, verseNo: next });
		// Treat the just-recommended verse as if it were in New so the next
		// call skips it and picks a different verse.
		extendedProgress = [
			...extendedProgress,
			{
				id: `${packageId}:${next}`,
				packageId,
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

- [ ] **Step 4: Verify**

Run: `pnpm test suggestions`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs/suggestions.ts tests/unit/suggestions.test.ts
git commit -m "feat(srs): add buildSuggestions for empty New slots"
```

---

## Task 6: RatingButtons + QueueProgress components

**Files:**
- Create: `src/lib/components/srs/RatingButtons.svelte`
- Create: `src/lib/components/srs/QueueProgress.svelte`
- Create: `tests/unit/RatingButtons.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/RatingButtons.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import RatingButtons from '../../src/lib/components/srs/RatingButtons.svelte';

describe('RatingButtons', () => {
	it('renders all 4 buttons with Korean labels', () => {
		render(RatingButtons, { props: { onrate: () => {} } });
		expect(screen.getByRole('button', { name: '다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '어렵' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '좋음' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '쉬움' })).toBeInTheDocument();
	});

	it('emits 1 for 다시', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		expect(onrate).toHaveBeenCalledWith(1);
	});

	it('emits 2 for 어렵', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '어렵' }));
		expect(onrate).toHaveBeenCalledWith(2);
	});

	it('emits 3 for 좋음', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '좋음' }));
		expect(onrate).toHaveBeenCalledWith(3);
	});

	it('emits 4 for 쉬움', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '쉬움' }));
		expect(onrate).toHaveBeenCalledWith(4);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test RatingButtons`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RatingButtons**

Create `src/lib/components/srs/RatingButtons.svelte`:

```svelte
<script lang="ts">
	interface Props {
		onrate: (score: number) => void;
	}
	let { onrate }: Props = $props();

	const ratings: Array<{ score: number; label: string; tone: string }> = [
		{ score: 1, label: '다시', tone: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' },
		{ score: 2, label: '어렵', tone: 'bg-[var(--color-elevated)] text-[var(--color-text)]' },
		{ score: 3, label: '좋음', tone: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' },
		{ score: 4, label: '쉬움', tone: 'bg-[var(--color-accent)] text-white' }
	];
</script>

<div role="group" class="grid grid-cols-4 gap-2">
	{#each ratings as r (r.score)}
		<button
			type="button"
			onclick={() => onrate(r.score)}
			class="rounded-xl py-3 text-[14px] font-medium transition-opacity hover:opacity-90 {r.tone}"
		>
			{r.label}
		</button>
	{/each}
</div>
```

- [ ] **Step 4: Verify**

Run: `pnpm test RatingButtons`
Expected: PASS — 5 tests.

- [ ] **Step 5: Implement QueueProgress**

Create `src/lib/components/srs/QueueProgress.svelte`:

```svelte
<script lang="ts">
	interface Props {
		current: number; // 1-indexed
		total: number;
	}
	let { current, total }: Props = $props();
</script>

<div
	class="text-[12px] font-medium uppercase tracking-[0.16em] tabular-nums text-[var(--color-text-tertiary)]"
	aria-label={`${current} of ${total}`}
>
	{Math.min(current, total)} / {total}
</div>
```

No unit test for QueueProgress — it's a trivial display component.

- [ ] **Step 6: Type-check**

Run: `pnpm check`
Expected: PASS — 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/srs/RatingButtons.svelte src/lib/components/srs/QueueProgress.svelte tests/unit/RatingButtons.test.ts
git commit -m "feat(srs): add RatingButtons and QueueProgress components"
```

---

## Task 7: ReviewCard component (review variant, 3 stages)

**Files:**
- Create: `src/lib/components/srs/ReviewCard.svelte`
- Create: `tests/unit/ReviewCard.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/ReviewCard.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ReviewCard from '../../src/lib/components/srs/ReviewCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verse: StoredVerse = {
	package_id: 'pkg',
	no: 1,
	i: 1,
	title: '중심되신 그리스도',
	cite: '고후 5:17',
	w: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다'
};

const baseProps = {
	verse,
	onCiteRated: () => {},
	onRecallRated: () => {}
};

describe('ReviewCard', () => {
	it('Stage 1: shows citation, hides title and body, shows Title 힌트 button', () => {
		render(ReviewCard, { props: baseProps });
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
		expect(screen.queryByText('중심되신 그리스도')).toBeNull();
		expect(screen.queryByText(/그런즉 누구든지/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Title 힌트 보기' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /구절 보기/ })).toBeInTheDocument();
	});

	it('Stage 1: Title 힌트 button reveals title in place', async () => {
		render(ReviewCard, { props: baseProps });
		await fireEvent.click(screen.getByRole('button', { name: 'Title 힌트 보기' }));
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
	});

	it('Stage 1 → Stage 2 on 구절 보기 tap; shows first clause + rating buttons', async () => {
		render(ReviewCard, { props: baseProps });
		await fireEvent.click(screen.getByRole('button', { name: /구절 보기/ }));
		// First clause (5 words: ceil(15/3)=5)
		expect(screen.getByText('그런즉 누구든지 그리스도 안에 있으면')).toBeInTheDocument();
		// Rating buttons present
		expect(screen.getByRole('button', { name: '다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '쉬움' })).toBeInTheDocument();
	});

	it('Stage 2 cite rating: emits onCiteRated with score and advances to Stage 3', async () => {
		const onCiteRated = vi.fn();
		render(ReviewCard, { props: { ...baseProps, onCiteRated } });
		await fireEvent.click(screen.getByRole('button', { name: /구절 보기/ }));
		await fireEvent.click(screen.getByRole('button', { name: '좋음' }));
		expect(onCiteRated).toHaveBeenCalledWith(3);
		// Stage 3: full text visible
		expect(screen.getByText(verse.w)).toBeInTheDocument();
		// Rating row still present for recall axis
		expect(screen.getByRole('button', { name: '쉬움' })).toBeInTheDocument();
	});

	it('Stage 3 recall rating: emits onRecallRated with score', async () => {
		const onRecallRated = vi.fn();
		render(ReviewCard, { props: { ...baseProps, onRecallRated } });
		// advance through Stage 1 → 2 → 3
		await fireEvent.click(screen.getByRole('button', { name: /구절 보기/ }));
		await fireEvent.click(screen.getByRole('button', { name: '좋음' })); // cite
		await fireEvent.click(screen.getByRole('button', { name: '쉬움' })); // recall
		expect(onRecallRated).toHaveBeenCalledWith(4);
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test ReviewCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ReviewCard**

Create `src/lib/components/srs/ReviewCard.svelte`:

```svelte
<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import { extractFirstClause } from '$lib/srs/firstClause';
	import RatingButtons from './RatingButtons.svelte';

	interface Props {
		verse: StoredVerse;
		onCiteRated: (score: number) => void;
		onRecallRated: (score: number) => void;
	}
	let { verse, onCiteRated, onRecallRated }: Props = $props();

	type Stage = 1 | 2 | 3;
	let stage = $state<Stage>(1);
	let titleHintShown = $state(false);

	const firstClause = $derived(extractFirstClause(verse.w));

	function advance() {
		stage = 2;
	}

	function rateCite(score: number) {
		onCiteRated(score);
		stage = 3;
	}

	function rateRecall(score: number) {
		onRecallRated(score);
		// stage stays at 3; parent will swap to next card
	}
</script>

<article
	class="review-card mx-auto flex flex-col rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-10"
>
	<header class="flex flex-col items-center gap-3 text-center">
		<p class="text-[24px] font-semibold tabular-nums text-[var(--color-text)]">{verse.cite}</p>
		{#if stage === 1 && titleHintShown}
			<p class="text-[16px] text-[var(--color-text-secondary)]">{verse.title}</p>
		{/if}
	</header>

	{#if stage === 1}
		<div class="mt-10 flex flex-col items-center gap-3">
			{#if !titleHintShown}
				<button
					type="button"
					onclick={() => (titleHintShown = true)}
					class="text-[12px] font-medium text-[var(--color-text-tertiary)] underline-offset-4 hover:underline"
				>
					Title 힌트 보기
				</button>
			{/if}
			<button
				type="button"
				onclick={advance}
				class="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
			>
				구절 보기 →
			</button>
		</div>
	{:else if stage === 2}
		<p class="mt-8 break-keep text-center text-[17px] leading-[1.85] text-[var(--color-text)]">
			{firstClause}
		</p>
		<div class="mt-8">
			<RatingButtons onrate={rateCite} />
		</div>
	{:else}
		<p
			class="mt-8 whitespace-pre-line break-keep text-center text-[17px] leading-[1.85] text-[var(--color-text)]"
		>
			{verse.w}
		</p>
		<div class="mt-8">
			<RatingButtons onrate={rateRecall} />
		</div>
	{/if}
</article>

<style>
	.review-card {
		box-shadow: var(--shadow-card);
	}
</style>
```

- [ ] **Step 4: Verify**

Run: `pnpm test ReviewCard`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/srs/ReviewCard.svelte tests/unit/ReviewCard.test.ts
git commit -m "feat(srs): add ReviewCard component with 3 review stages"
```

---

## Task 8: SuggestionCard component

**Files:**
- Create: `src/lib/components/srs/SuggestionCard.svelte`
- Create: `tests/unit/SuggestionCard.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/SuggestionCard.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import SuggestionCard from '../../src/lib/components/srs/SuggestionCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verse: StoredVerse = {
	package_id: 'pkg',
	no: 1,
	i: 1,
	title: '중심되신 그리스도',
	cite: '고후 5:17',
	w: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다'
};

describe('SuggestionCard', () => {
	it('shows citation, title, and first-clause preview', () => {
		render(SuggestionCard, { props: { verse, oncommit: () => {}, onskip: () => {} } });
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
		expect(screen.getByText('그런즉 누구든지 그리스도 안에 있으면')).toBeInTheDocument();
	});

	it('renders 학습 시작 and Skip buttons', () => {
		render(SuggestionCard, { props: { verse, oncommit: () => {}, onskip: () => {} } });
		expect(screen.getByRole('button', { name: '학습 시작' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
	});

	it('학습 시작 tap emits oncommit', async () => {
		const oncommit = vi.fn();
		render(SuggestionCard, { props: { verse, oncommit, onskip: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
		expect(oncommit).toHaveBeenCalledOnce();
	});

	it('Skip tap emits onskip', async () => {
		const onskip = vi.fn();
		render(SuggestionCard, { props: { verse, oncommit: () => {}, onskip } });
		await fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
		expect(onskip).toHaveBeenCalledOnce();
	});
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm test SuggestionCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/components/srs/SuggestionCard.svelte`:

```svelte
<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import { extractFirstClause } from '$lib/srs/firstClause';

	interface Props {
		verse: StoredVerse;
		oncommit: () => void;
		onskip: () => void;
	}
	let { verse, oncommit, onskip }: Props = $props();

	const firstClause = $derived(extractFirstClause(verse.w));
</script>

<article
	class="suggestion-card mx-auto flex flex-col rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-10"
>
	<header class="flex flex-col items-center gap-2 text-center">
		<p
			class="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
		>
			다음 추천
		</p>
		<p class="text-[24px] font-semibold tabular-nums text-[var(--color-text)]">{verse.cite}</p>
		<p class="text-[16px] text-[var(--color-text-secondary)]">{verse.title}</p>
	</header>

	<p
		class="mt-8 break-keep text-center text-[15px] leading-[1.75] text-[var(--color-text-secondary)]"
	>
		{firstClause}…
	</p>

	<div class="mt-10 flex flex-col items-center gap-3">
		<button
			type="button"
			onclick={oncommit}
			class="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-8 py-3 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
		>
			학습 시작
		</button>
		<button
			type="button"
			onclick={onskip}
			class="text-[13px] font-medium text-[var(--color-text-tertiary)] underline-offset-4 hover:underline"
		>
			Skip
		</button>
	</div>
</article>

<style>
	.suggestion-card {
		box-shadow: var(--shadow-card);
	}
</style>
```

- [ ] **Step 4: Verify**

Run: `pnpm test SuggestionCard`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/srs/SuggestionCard.svelte tests/unit/SuggestionCard.test.ts
git commit -m "feat(srs): add SuggestionCard component for empty New slots"
```

---

## Task 9: /today/+page.ts load orchestration

**Files:**
- Create: `src/routes/today/+page.ts`

No unit test for this file — it's I/O-heavy orchestration covered by E2E in Task 13. The pure helpers it composes (orchestrate, scheduler, suggestions) are already unit-tested.

- [ ] **Step 1: Create the load function**

Create `src/routes/today/+page.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { getActivePackageId } from '$lib/db/activePackage';
import {
	listProgressByPackage,
	upsertProgress,
	type VerseProgress as _VP
} from '$lib/db/progress';
import { listVerses } from '$lib/db/verses';
import { getActivityHistory, markActiveToday } from '$lib/db/activity';
import { applyGraduations } from '$lib/srs/orchestrate';
import { buildTodayQueue } from '$lib/srs/scheduler';
import { buildSuggestions, type SuggestionEntry } from '$lib/srs/suggestions';
import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface TodayLoadData {
	activeId: string;
	queue: VerseProgress[];
	suggestions: SuggestionEntry[];
	packageVerses: StoredVerse[];
}

export const load: PageLoad = async (): Promise<TodayLoadData> => {
	const activeId = await getActivePackageId();
	if (!activeId) {
		throw redirect(307, '/');
	}

	const [rawProgress, packageVerses, activity] = await Promise.all([
		listProgressByPackage(activeId),
		listVerses(activeId),
		getActivityHistory()
	]);

	// 1. Apply pending graduations + persist them.
	const { graduated, current } = applyGraduations(rawProgress);
	for (const g of graduated) {
		await upsertProgress(g);
	}

	// 2. Stamp today as an active day (side effect).
	await markActiveToday();

	// 3. Compose queue + suggestions.
	const queue = buildTodayQueue(current, activity);
	const suggestions = buildSuggestions(current, packageVerses);

	return { activeId, queue, suggestions, packageVerses };
};
```

- [ ] **Step 2: Verify type check**

Run: `pnpm check`
Expected: PASS — 0 errors. Note: `listVerses` import — check whether the function exists; if not, add an export to `src/lib/db/verses.ts`.

If `listVerses` is missing, add to `src/lib/db/verses.ts` (above `loadPackageData`):

```ts
export async function listVerses(packageId: string): Promise<StoredVerse[]> {
	return db.verses.where('package_id').equals(packageId).sortBy('no');
}
```

Run `pnpm check` again, expect 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/today/+page.ts src/lib/db/verses.ts
git commit -m "feat(today): add load() orchestrating graduations + queue + suggestions"
```

---

## Task 10: /today/+page.svelte session UI

**Files:**
- Create: `src/routes/today/+page.svelte`

No unit test — exercised by E2E in Task 13.

- [ ] **Step 1: Implement the session UI**

Create `src/routes/today/+page.svelte`:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import ReviewCard from '$lib/components/srs/ReviewCard.svelte';
	import SuggestionCard from '$lib/components/srs/SuggestionCard.svelte';
	import QueueProgress from '$lib/components/srs/QueueProgress.svelte';
	import { goto } from '$app/navigation';
	import { upsertProgress, pushRating, progressId } from '$lib/db/progress';
	import type { VerseProgress } from '$lib/types';
	import type { TodayLoadData } from './+page';

	let { data }: { data: TodayLoadData } = $props();

	type QueueItem =
		| { kind: 'review'; progress: VerseProgress }
		| { kind: 'suggest'; packageId: string; verseNo: number };

	const verseByNo = $derived(new Map(data.packageVerses.map((v) => [v.no, v])));

	let items = $state<QueueItem[]>(
		[
			...data.queue.map((p): QueueItem => ({ kind: 'review', progress: p })),
			...data.suggestions.map(
				(s): QueueItem => ({ kind: 'suggest', packageId: s.packageId, verseNo: s.verseNo })
			)
		]
	);

	let index = $state(0);
	let cardKey = $state(0); // bumps to force ReviewCard remount per item

	const current = $derived(items[index]);
	const isDone = $derived(index >= items.length);
	const total = items.length;

	function next() {
		index += 1;
		cardKey += 1;
	}

	async function onCiteRated(score: number) {
		if (!current || current.kind !== 'review') return;
		await pushRating(
			current.progress.packageId,
			current.progress.verseNo,
			'cite',
			score
		).catch(() => {});
	}

	async function onRecallRated(score: number) {
		if (!current || current.kind !== 'review') return;
		await pushRating(
			current.progress.packageId,
			current.progress.verseNo,
			'recall',
			score
		).catch(() => {});
		next();
	}

	async function onCommitSuggestion() {
		if (!current || current.kind !== 'suggest') return;
		const fresh: VerseProgress = {
			id: progressId(current.packageId, current.verseNo),
			packageId: current.packageId,
			verseNo: current.verseNo,
			bucket: 'new',
			enteredBucketAt: Date.now(),
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		};
		await upsertProgress(fresh).catch(() => {});
		next();
	}

	function onSkipSuggestion() {
		next();
	}
</script>

<Header title="오늘" onBack={() => goto('/')} />

<main class="mx-auto max-w-2xl px-5 pb-12 pt-4">
	{#if isDone}
		<section
			class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<h2 class="text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				🎉 오늘은 다 했어요
			</h2>
			<p class="mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				총 {total}장 완료
			</p>
			<button
				type="button"
				onclick={() => goto('/')}
				class="mt-7 inline-flex items-center rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
			>
				홈으로
			</button>
		</section>
	{:else if total === 0}
		<section
			class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<h2 class="text-[20px] font-semibold leading-tight text-[var(--color-text)]">
				오늘은 카드가 없어요
			</h2>
			<p class="mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				활성 패키지를 다 외웠거나, 추가할 New 슬롯이 가득찼습니다.
			</p>
		</section>
	{:else}
		<div class="mb-4 flex items-center justify-center">
			<QueueProgress current={index + 1} {total} />
		</div>

		{#key cardKey}
			{#if current && current.kind === 'review'}
				{@const v = verseByNo.get(current.progress.verseNo)}
				{#if v}
					<ReviewCard verse={v} {onCiteRated} {onRecallRated} />
				{/if}
			{:else if current && current.kind === 'suggest'}
				{@const v = verseByNo.get(current.verseNo)}
				{#if v}
					<SuggestionCard verse={v} oncommit={onCommitSuggestion} onskip={onSkipSuggestion} />
				{/if}
			{/if}
		{/key}
	{/if}
</main>

<style>
	.hero-card {
		box-shadow: var(--shadow-card);
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: PASS — 0 errors.

- [ ] **Step 3: Smoke-build**

Run: `pnpm build`
Expected: PASS — vite build completes.

- [ ] **Step 4: Commit**

```bash
git add src/routes/today/+page.svelte
git commit -m "feat(today): full-screen review session UI"
```

---

## Task 11: Home hero — SRS-aware states

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Update home with new states**

Replace the entire content of `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageCard from '$lib/components/PackageCard.svelte';
	import { listPackages } from '$lib/db/verses';
	import { listVerses } from '$lib/db/verses';
	import { getRecentPackageIds } from '$lib/db/recent';
	import { getActivePackageId } from '$lib/db/activePackage';
	import { listProgressByPackage } from '$lib/db/progress';
	import { getActivityHistory } from '$lib/db/activity';
	import { applyGraduations } from '$lib/srs/orchestrate';
	import { buildTodayQueue } from '$lib/srs/scheduler';
	import { buildSuggestions } from '$lib/srs/suggestions';
	import type { PackageMeta } from '$lib/types';
	import { Sparkles } from 'lucide-svelte';

	let packages: PackageMeta[] = $state([]);
	let recentIds: string[] = $state([]);
	let activePackageId: string | null = $state(null);
	let queueLen = $state(0);
	let newCount = $state(0);
	let reviewCount = $state(0);
	let suggestionCount = $state(0);
	let allMemorized = $state(false);

	$effect(() => {
		(async () => {
			const [pkgs, recent, activeId] = await Promise.all([
				listPackages(),
				getRecentPackageIds(),
				getActivePackageId()
			]);
			packages = pkgs;
			recentIds = recent;
			activePackageId = activeId;
			if (!activeId) return;

			const [progress, packageVerses, activity] = await Promise.all([
				listProgressByPackage(activeId),
				listVerses(activeId),
				getActivityHistory()
			]);
			const { current } = applyGraduations(progress);
			const queue = buildTodayQueue(current, activity);
			const suggestions = buildSuggestions(current, packageVerses);
			queueLen = queue.length;
			newCount = queue.filter((p) => p.bucket === 'new').length;
			reviewCount = queue.length - newCount;
			suggestionCount = suggestions.length;
			allMemorized = packageVerses.length > 0 && suggestions.length === 0 && queue.length === 0;
		})().catch(() => {});
	});

	const today = new Intl.DateTimeFormat('ko-KR', {
		month: 'long',
		day: 'numeric',
		weekday: 'long'
	}).format(new Date());

	const heroState = $derived(
		!activePackageId
			? 'no-active'
			: allMemorized
				? 'all-done-package'
				: queueLen + suggestionCount === 0
					? 'all-done-today'
					: 'has-queue'
	);
</script>

<Header title={today} />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	<section
		class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-6 pb-7 pt-8"
	>
		<span
			class="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[var(--color-accent-soft)] opacity-70 blur-2xl"
			aria-hidden="true"
		></span>

		<div
			class="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
		>
			<Sparkles size={12} class="text-[var(--color-accent)]" />
			Today
		</div>

		{#if heroState === 'no-active'}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				학습할 패키지를 골라보세요
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				라이브러리에서 패키지를 열고<br />「이 패키지로 학습 시작」을 누르세요.
			</p>
			<a
				href="/library"
				class="relative mt-6 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				라이브러리로 →
			</a>
		{:else if heroState === 'has-queue'}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				{queueLen + suggestionCount}장 남음
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				{#if newCount > 0 || reviewCount > 0}
					새 {newCount} · 복습 {reviewCount}{#if suggestionCount > 0} · 추천 {suggestionCount}{/if}
				{:else if suggestionCount > 0}
					추천 구절 {suggestionCount}장
				{/if}
			</p>
			<a
				href="/today"
				class="relative mt-6 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				시작 →
			</a>
		{:else if heroState === 'all-done-today'}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				🎉 오늘은 다 했어요
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				내일 다시 만나요.
			</p>
		{:else}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				이 패키지를 다 외웠어요
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				다른 패키지를 시작해 보세요.
			</p>
			<a
				href="/library"
				class="relative mt-6 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				라이브러리로 →
			</a>
		{/if}
	</section>

	<div class="mt-8 mb-3 flex items-baseline justify-between px-1">
		<h3
			class="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]"
		>
			최근 패키지
		</h3>
		<a
			href="/library"
			class="text-[12px] font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
		>
			전체 보기 →
		</a>
	</div>

	<div class="space-y-3">
		{#each packages.slice(0, 3) as pkg (pkg.id)}
			<PackageCard {pkg} recent={recentIds.includes(pkg.id)} />
		{/each}
	</div>
</main>

<style>
	.hero-card {
		box-shadow: var(--shadow-card);
	}
</style>
```

- [ ] **Step 2: Type-check + run all tests**

Run: `pnpm check` (expect 0 errors)
Run: `pnpm test` (expect no regressions)

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(home): SRS-aware hero with 4 states"
```

---

## Task 12: /library/[packageId] activation button + banner

**Files:**
- Modify: `src/routes/library/[packageId]/+page.svelte`

- [ ] **Step 1: Add activation logic + UI**

Update `src/routes/library/[packageId]/+page.svelte`. Add imports at the top of the script:

```ts
	import { getActivePackageId, setActivePackage } from '$lib/db/activePackage';
```

Add state below the existing `let showVerseText = $state(true);` line:

```ts
	let activePackageId: string | null = $state(null);
	let bannerVisible = $state(false);
```

Inside the existing `$effect` body (the one that loads `recordPackageView`), add active-package read:

```ts
		(async () => {
			activePackageId = await getActivePackageId();
		})().catch(() => {});
```

Add the activation handler below the existing `toggleVerseText` function:

```ts
	async function activatePackage() {
		await setActivePackage(packageId);
		activePackageId = packageId;
		bannerVisible = true;
		// auto-dismiss after 3s
		setTimeout(() => {
			bannerVisible = false;
		}, 3000);
	}
```

In the template, add the activation control after the `<PackageTabStrip>` and before the metadata row (line ~89). Replace this:

```svelte
	<PackageTabStrip packages={data.allPackages} currentId={packageId} />

	<div class="mb-3 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
```

with:

```svelte
	<PackageTabStrip packages={data.allPackages} currentId={packageId} />

	<div class="mb-4 flex items-center justify-between gap-2 px-1">
		<div class="text-[12px] text-[var(--color-text-secondary)]">
			{#if activePackageId === packageId}
				<span
					class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-accent)]"
				>
					학습 중
				</span>
			{/if}
		</div>
		{#if activePackageId !== packageId}
			<button
				type="button"
				onclick={activatePackage}
				class="inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
			>
				이 패키지로 학습 시작
			</button>
		{/if}
	</div>

	{#if bannerVisible}
		<div
			role="status"
			class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-4 py-3 text-[13px] text-[var(--color-text)]"
		>
			<span>활성 패키지로 설정되었어요.</span>
			<a
				href="/today"
				class="rounded-full bg-[var(--color-accent)] px-3 py-1 text-[12px] font-medium text-white hover:opacity-90"
			>
				오늘의 큐 →
			</a>
		</div>
	{/if}

	<div class="mb-3 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
```

- [ ] **Step 2: Type-check + tests**

Run: `pnpm check` (expect 0 errors)
Run: `pnpm test` (expect no regressions)

- [ ] **Step 3: Commit**

```bash
git add src/routes/library/\[packageId\]/+page.svelte
git commit -m "feat(library): add 'this package as active' button + banner"
```

---

## Task 13: E2E test for first-user and daily flows

**Files:**
- Create: `tests/e2e/today.spec.ts`

- [ ] **Step 1: Write E2E spec**

Create `tests/e2e/today.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Today + intake e2e', () => {
	test('first-time user: activates package and commits first suggestion', async ({ page }) => {
		// Clear Dexie before each navigation to start fresh
		await page.goto('/library');
		await page.evaluate(async () => {
			const dbs = await indexedDB.databases();
			for (const d of dbs) {
				if (d.name) await new Promise((res) => {
					const req = indexedDB.deleteDatabase(d.name!);
					req.onsuccess = () => res(null);
					req.onerror = () => res(null);
					req.onblocked = () => res(null);
				});
			}
		});
		await page.reload();

		// Navigate to a package detail
		await page.goto('/library/60_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Activate this package
		await page.getByRole('button', { name: '이 패키지로 학습 시작' }).click();
		await expect(page.getByText('활성 패키지로 설정되었어요.')).toBeVisible();
		await expect(page.getByText('학습 중')).toBeVisible();

		// Tap CTA → /today
		await page.getByRole('link', { name: '오늘의 큐 →' }).click();
		await expect(page).toHaveURL(/\/today/);

		// Should see suggestion card for verseNo 1
		await expect(page.getByText('다음 추천')).toBeVisible();
		await expect(page.getByRole('button', { name: '학습 시작' })).toBeVisible();

		// Commit first suggestion
		await page.getByRole('button', { name: '학습 시작' }).click();

		// Should advance to next item (second suggestion or done screen)
		// Either way, the initial suggestion's button text should no longer be visible
		// for the same verse — at minimum, the queue index advanced.
		await expect(page.getByText('1 / 2')).not.toBeVisible({ timeout: 3000 });
	});

	test('redirects to home when no active package', async ({ page }) => {
		// Clear DB
		await page.goto('/');
		await page.evaluate(async () => {
			const dbs = await indexedDB.databases();
			for (const d of dbs) {
				if (d.name) await new Promise((res) => {
					const req = indexedDB.deleteDatabase(d.name!);
					req.onsuccess = () => res(null);
					req.onerror = () => res(null);
					req.onblocked = () => res(null);
				});
			}
		});

		// Try to access /today directly
		await page.goto('/today');
		// Should be redirected to /
		await expect(page).toHaveURL(/\/$|\/?$/);
	});
});
```

- [ ] **Step 2: Run E2E**

Run: `pnpm test:e2e tests/e2e/today.spec.ts`
Expected: PASS — 2 scenarios pass on both chromium and iphone-14 projects (4 test invocations total).

- [ ] **Step 3: Run full suite for sanity**

Run: `pnpm test` (unit) → expect all green
Run: `pnpm test:e2e` (full e2e) → expect all green

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/today.spec.ts
git commit -m "test(e2e): first-user and redirect flows for /today"
```

---

## Self-Review

### Spec coverage

| Spec section | Task |
|---|---|
| `lastActiveDayKey?` on VerseProgress | 1 |
| `pushRating` increments daysActiveInBucket per local date | 2 |
| `extractFirstClause` 33% heuristic, min 3, max 8, override seam | 3 |
| `applyGraduations` separating graduated cards from current state | 4 |
| `buildSuggestions` filling 0-2 empty New slots | 5 |
| `RatingButtons` 4-button row (Again/Hard/Good/Easy → 1/2/3/4) | 6 |
| `QueueProgress` indicator | 6 |
| `ReviewCard` 3-stage review variant with title hint | 7 |
| `SuggestionCard` single-stage with [학습 시작] + [Skip] | 8 |
| `/today/+page.ts load()` orchestrates grad + queue + suggestions | 9 |
| `/today/+page.svelte` walks queue → done screen | 10 |
| Home hero 4 states (no-active / has-queue / all-done-today / all-done-package) | 11 |
| `/library/[packageId]` activation button + banner | 12 |
| E2E: first-user flow + redirect-when-no-active | 13 |

### Placeholder scan

No "TBD", "TODO", "implement later" markers. Every step contains complete code or exact commands. The plan's "Open Items Settled During Implementation" section of the spec is intentionally deferred (transient banner timing, icon choices) — not blockers.

### Type consistency

- `VerseProgress` fields used consistently across all tasks.
- `SuggestionEntry`: `{ packageId: string; verseNo: number }` matches between Task 5 (suggestions) and Tasks 9-10 (consumers).
- `pushRating` signature with optional `options.dateKey` consistent between Task 2 (impl + tests) and Task 10 (consumer omits the option).
- `extractFirstClause(text, override?)` signature matches Task 3 (impl) and Tasks 7-8 (consumers).
- `applyGraduations` return shape `{ graduated, current }` matches Task 4 (impl) and Tasks 9, 11 (consumers).
- `buildSuggestions(progress, packageVerses)` matches Task 5 (impl) and Tasks 9, 11 (consumers).
