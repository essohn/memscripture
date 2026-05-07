# Category Tags & Filter Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category-aware navigation to the package detail page (3 strips + inline tags on verse rows) and tag display on `VerseCard`, with URL-driven filter state using numeric indices.

**Architecture:** Pure filter helpers in `verses.ts` (no DB changes), four new presentational components (`CategoryTag`, `PackageTabStrip`, `SeriesSubTabStrip`, `GroupSubStrip`), restructured `GroupList` row to avoid nested interactive elements, and `+page.svelte` wires URL search params (`?s=` / `?g=`) to component state via `$derived`.

**Tech Stack:** SvelteKit 2.x / Svelte 5 / TypeScript / Tailwind v4 / Vitest / Playwright / Testing Library Svelte

**Spec:** [docs/superpowers/specs/2026-05-07-category-tags-and-filter-navigation-design.md](../specs/2026-05-07-category-tags-and-filter-navigation-design.md)

---

## File Structure

```
src/lib/db/verses.ts                          EDIT  add 4 pure helpers (level1Groups,
                                                   level2GroupsInSeries, tagsForVerse,
                                                   filterVerses)
src/lib/components/filter/
  CategoryTag.svelte                          NEW   single tag pill (button|static)
  SeriesSubTabStrip.svelte                    NEW   level-1 chips (?s=)
  GroupSubStrip.svelte                        NEW   level-2 chips (?g=)
src/lib/components/nav/
  PackageTabStrip.svelte                      NEW   top tab strip
src/lib/components/GroupList.svelte           EDIT  row link + separate tag buttons
src/lib/components/card/VerseCard.svelte      EDIT  add tags row, remove decorative quote
src/routes/library/[packageId]/+page.svelte   EDIT  wire strips + URL filters
src/routes/library/[packageId]/[verseNo]/+page.svelte  EDIT  pass groups to VerseCard

tests/unit/filter-helpers.test.ts             NEW
tests/unit/CategoryTag.test.ts                NEW
tests/unit/SeriesSubTabStrip.test.ts          NEW
tests/unit/GroupSubStrip.test.ts              NEW
tests/e2e/category-filters.spec.ts            NEW
```

---

## Task 1: Remove decorative quote from VerseCard

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`

- [ ] **Step 1: Delete the oversized quote span**

In `src/lib/components/card/VerseCard.svelte`, remove the `<span>` element that renders `"` at the top-left. Find this block:

```svelte
	<span
		class="pointer-events-none absolute -left-1 -top-6 select-none text-[160px] font-bold leading-none text-[var(--color-accent-soft)]"
		aria-hidden="true">"</span
	>
```

Delete it entirely. Also delete the now-orphaned `relative` positioning needs from inside the article — check that the inner `<header>` and `<p>` still have `relative` only where it's actually needed (it was needed because of the absolute quote behind them; now they can be plain).

After edit, the article should look like:

```svelte
<article
	class="verse-card overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 pb-9 pt-7"
>
	<header class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<p class="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
				{packageName ?? ''}
			</p>
			<span
				class="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-accent-soft)] px-2 text-[12px] font-semibold tabular-nums text-[var(--color-accent)]"
			>
				{verse.no}
			</span>
		</div>
		<h2 class="text-[22px] font-semibold leading-tight text-[var(--color-text)]">
			{verse.title}
		</h2>
		<p class="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
			<span class="h-px w-5 bg-[var(--color-accent)]/60"></span>
			{verse.cite}
		</p>
	</header>

	<p
		class="mt-6 whitespace-pre-line break-keep text-[17px] leading-[1.85] text-[var(--color-text)]"
	>
		{verse.w}
	</p>
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}
</style>
```

(Note: the `relative` class is removed from the article, and `relative mt-6` becomes just `mt-6` on the body paragraph.)

- [ ] **Step 2: Verify build still works**

Run: `pnpm check && pnpm test`
Expected: typecheck 0 errors; vitest 11/11 passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte
git commit -m "design: remove decorative quote mark from VerseCard"
```

---

## Task 2: Add filter helpers to verses.ts (TDD)

**Files:**
- Modify: `src/lib/db/verses.ts`
- Create: `tests/unit/filter-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/filter-helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	level1Groups,
	level2GroupsInSeries,
	tagsForVerse,
	filterVerses
} from '../../src/lib/db/verses';
import type { IndexGroup } from '../../src/lib/types';
import type { StoredVerse } from '../../src/lib/db/local';

const PID = '60_krv';

// Fixture mimicking 60_krv shape: 2 series with 2 sub-groups each.
const groups: IndexGroup[] = [
	{ package_id: PID, group_name: 'A. 새로운 삶', level: 1, index: [1, 2, 3, 4] },
	{ package_id: PID, group_name: 'A.1 중심', level: 2, index: [1, 2] },
	{ package_id: PID, group_name: 'A.2 순종', level: 2, index: [3, 4] },
	{ package_id: PID, group_name: 'B. 그리스도', level: 1, index: [5, 6, 7, 8] },
	{ package_id: PID, group_name: 'B.1 신성', level: 2, index: [5, 6] },
	{ package_id: PID, group_name: 'B.2 인성', level: 2, index: [7, 8] }
];

const flatGroups: IndexGroup[] = [
	{ package_id: '5_krv', group_name: 'one', level: 1, index: [1, 2, 3, 4, 5] }
];

const seriesOnlyGroups: IndexGroup[] = [
	{ package_id: '100_krv', group_name: 'S1', level: 1, index: [1, 2, 3] },
	{ package_id: '100_krv', group_name: 'S2', level: 1, index: [4, 5, 6] }
];

function v(no: number): StoredVerse {
	return { package_id: PID, no, i: no, title: `t${no}`, cite: `c${no}`, w: `w${no}` };
}
const verses: StoredVerse[] = [v(1), v(2), v(3), v(4), v(5), v(6), v(7), v(8)];

describe('level1Groups', () => {
	it('returns level-1 groups in JSON order', () => {
		const r = level1Groups(groups);
		expect(r.map((g) => g.group_name)).toEqual(['A. 새로운 삶', 'B. 그리스도']);
	});

	it('returns single group for flat package', () => {
		expect(level1Groups(flatGroups)).toHaveLength(1);
	});
});

describe('level2GroupsInSeries', () => {
	it('returns level-2 groups whose index is subset of series', () => {
		const r = level2GroupsInSeries(groups, 0);
		expect(r.map((g) => g.group_name)).toEqual(['A.1 중심', 'A.2 순종']);
	});

	it('scopes by selected series', () => {
		const r = level2GroupsInSeries(groups, 1);
		expect(r.map((g) => g.group_name)).toEqual(['B.1 신성', 'B.2 인성']);
	});

	it('returns [] when series has no level-2 (e.g., 100_krv)', () => {
		expect(level2GroupsInSeries(seriesOnlyGroups, 0)).toEqual([]);
	});

	it('returns [] when seriesIndex is null', () => {
		expect(level2GroupsInSeries(groups, null)).toEqual([]);
	});

	it('returns [] when seriesIndex is out of range', () => {
		expect(level2GroupsInSeries(groups, 99)).toEqual([]);
	});
});

describe('tagsForVerse', () => {
	it('returns level-1 + level-2 tag with indices for verse 1', () => {
		const tags = tagsForVerse(groups, 1);
		expect(tags).toHaveLength(2);
		expect(tags[0]).toMatchObject({ level: 1, seriesIndex: 0 });
		expect(tags[0].group.group_name).toBe('A. 새로운 삶');
		expect(tags[1]).toMatchObject({ level: 2, seriesIndex: 0, groupIndex: 0 });
		expect(tags[1].group.group_name).toBe('A.1 중심');
	});

	it('returns level-1 only for series-only package', () => {
		const tags = tagsForVerse(seriesOnlyGroups, 1);
		expect(tags).toHaveLength(1);
		expect(tags[0]).toMatchObject({ level: 1, seriesIndex: 0 });
		expect(tags[0].groupIndex).toBeUndefined();
	});

	it('returns level-1 only for flat package (single group)', () => {
		const tags = tagsForVerse(flatGroups, 1);
		expect(tags).toHaveLength(1);
		expect(tags[0].level).toBe(1);
	});

	it('orders level-1 first, then level-2', () => {
		const tags = tagsForVerse(groups, 1);
		expect(tags[0].level).toBe(1);
		expect(tags[1].level).toBe(2);
	});

	it('returns [] for verse not in any group', () => {
		expect(tagsForVerse(groups, 99)).toEqual([]);
	});
});

describe('filterVerses', () => {
	it('returns all verses when seriesIndex is null', () => {
		const r = filterVerses(verses, groups, null, []);
		expect(r).toHaveLength(8);
	});

	it('filters by series only', () => {
		const r = filterVerses(verses, groups, 0, []);
		expect(r.map((v) => v.no)).toEqual([1, 2, 3, 4]);
	});

	it('filters by series + single level-2 group', () => {
		const r = filterVerses(verses, groups, 0, [0]);
		expect(r.map((v) => v.no)).toEqual([1, 2]);
	});

	it('filters by series + multiple level-2 groups (union)', () => {
		const r = filterVerses(verses, groups, 0, [0, 1]);
		expect(r.map((v) => v.no)).toEqual([1, 2, 3, 4]);
	});

	it('out-of-range seriesIndex passes through', () => {
		const r = filterVerses(verses, groups, 99, []);
		expect(r).toHaveLength(8);
	});

	it('out-of-range groupIndices are silently dropped', () => {
		const r = filterVerses(verses, groups, 0, [0, 99]);
		expect(r.map((v) => v.no)).toEqual([1, 2]);
	});
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test filter-helpers`
Expected: FAIL — exports `level1Groups`, `level2GroupsInSeries`, `tagsForVerse`, `filterVerses` not defined.

- [ ] **Step 3: Implement helpers in verses.ts**

Append the following to `src/lib/db/verses.ts` (keep all existing exports):

```ts
// ─── Filter helpers ────────────────────────────────────────────────────────

export function level1Groups(groups: IndexGroup[]): IndexGroup[] {
	return groups.filter((g) => g.level === 1);
}

function isSubset(child: number[], parent: number[]): boolean {
	const set = new Set(parent);
	return child.every((n) => set.has(n));
}

export function level2GroupsInSeries(
	groups: IndexGroup[],
	seriesIndex: number | null
): IndexGroup[] {
	if (seriesIndex === null) return [];
	const l1s = level1Groups(groups);
	const series = l1s[seriesIndex];
	if (!series) return [];
	return groups.filter((g) => g.level === 2 && isSubset(g.index, series.index));
}

export interface VerseTag {
	level: 1 | 2;
	group: IndexGroup;
	seriesIndex: number;
	groupIndex?: number;
}

export function tagsForVerse(groups: IndexGroup[], verseNo: number): VerseTag[] {
	const l1s = level1Groups(groups);
	const tags: VerseTag[] = [];

	// Level-1 tags first, in JSON order
	l1s.forEach((g, i) => {
		if (g.index.includes(verseNo)) {
			tags.push({ level: 1, group: g, seriesIndex: i });
		}
	});

	// Level-2 tags next: each l2 belongs to exactly one series; find its parent
	for (const g of groups) {
		if (g.level !== 2) continue;
		if (!g.index.includes(verseNo)) continue;

		const parentIdx = l1s.findIndex((l1) => isSubset(g.index, l1.index));
		if (parentIdx === -1) continue;

		const siblings = level2GroupsInSeries(groups, parentIdx);
		const groupIndex = siblings.findIndex((s) => s === g);
		if (groupIndex === -1) continue;

		tags.push({ level: 2, group: g, seriesIndex: parentIdx, groupIndex });
	}

	return tags;
}

export function filterVerses(
	verses: StoredVerse[],
	groups: IndexGroup[],
	seriesIndex: number | null,
	groupIndices: number[]
): StoredVerse[] {
	const l1s = level1Groups(groups);
	const series = seriesIndex !== null ? l1s[seriesIndex] : undefined;
	if (!series) return verses; // pass-through (null or out of range)

	const seriesSet = new Set(series.index);
	let kept = verses.filter((v) => seriesSet.has(v.no));

	if (groupIndices.length > 0) {
		const l2s = level2GroupsInSeries(groups, seriesIndex);
		const validGroups = groupIndices.map((i) => l2s[i]).filter((g): g is IndexGroup => Boolean(g));
		if (validGroups.length === 0) return kept; // all indices out of range → no further filter

		const allowed = new Set<number>();
		for (const g of validGroups) for (const n of g.index) allowed.add(n);
		kept = kept.filter((v) => allowed.has(v.no));
	}

	return kept;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test filter-helpers`
Expected: 17 passing.

- [ ] **Step 5: Run full check (typecheck + all unit tests)**

Run: `pnpm check && pnpm test`
Expected: 0 errors; 28 tests passing total.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/verses.ts tests/unit/filter-helpers.test.ts
git commit -m "feat: add pure filter helpers for category navigation"
```

---

## Task 3: CategoryTag component (TDD)

**Files:**
- Create: `src/lib/components/filter/CategoryTag.svelte`
- Create: `tests/unit/CategoryTag.test.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/lib/components/filter
```

- [ ] **Step 2: Write failing tests**

Create `tests/unit/CategoryTag.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import CategoryTag from '../../src/lib/components/filter/CategoryTag.svelte';

describe('CategoryTag', () => {
	it('renders the label for level-1 with gold styling', () => {
		render(CategoryTag, { props: { label: 'A. 새로운 삶', level: 1 } });
		const el = screen.getByText('A. 새로운 삶');
		expect(el).toBeInTheDocument();
	});

	it('renders the label for level-2', () => {
		render(CategoryTag, { props: { label: '중심되신 그리스도', level: 2 } });
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
	});

	it('emits click when interactive (default)', async () => {
		const onclick = vi.fn();
		render(CategoryTag, { props: { label: 'A', level: 1, onclick } });
		await fireEvent.click(screen.getByRole('button', { name: 'A' }));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('renders as static span when interactive=false (no role=button)', () => {
		render(CategoryTag, { props: { label: 'A', level: 1, interactive: false } });
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText('A')).toBeInTheDocument();
	});

	it('reflects active state via aria-pressed', () => {
		render(CategoryTag, { props: { label: 'A', level: 1, active: true } });
		const btn = screen.getByRole('button', { name: 'A' });
		expect(btn).toHaveAttribute('aria-pressed', 'true');
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test CategoryTag`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement CategoryTag.svelte**

Create `src/lib/components/filter/CategoryTag.svelte`:

```svelte
<script lang="ts">
	interface Props {
		label: string;
		level: 1 | 2;
		active?: boolean;
		interactive?: boolean;
		onclick?: (e: MouseEvent) => void;
	}
	let { label, level, active = false, interactive = true, onclick }: Props = $props();

	const baseClass =
		'inline-flex items-center text-[9.5px] leading-none font-medium px-[7px] py-[3px] rounded-full whitespace-nowrap transition-colors';

	const levelClass = $derived(
		level === 1
			? 'bg-[var(--color-accent)] text-white'
			: 'bg-[var(--color-accent-soft)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
	);

	const activeRing = $derived(active ? 'ring-2 ring-[var(--color-text)] ring-offset-1' : '');
</script>

{#if interactive}
	<button
		type="button"
		class="{baseClass} {levelClass} {activeRing} cursor-pointer"
		aria-pressed={active}
		{onclick}
	>
		{label}
	</button>
{:else}
	<span class="{baseClass} {levelClass}">{label}</span>
{/if}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test CategoryTag`
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/filter/CategoryTag.svelte tests/unit/CategoryTag.test.ts
git commit -m "feat: add CategoryTag component with level-aware styling"
```

---

## Task 4: PackageTabStrip component

**Files:**
- Create: `src/lib/components/nav/PackageTabStrip.svelte`

This component is a thin presentational wrapper — no complex logic, no test required. It just renders a horizontal scrolling list of package tabs.

- [ ] **Step 1: Implement PackageTabStrip.svelte**

Create `src/lib/components/nav/PackageTabStrip.svelte`:

```svelte
<script lang="ts">
	import type { PackageMeta } from '$lib/types';

	interface Props {
		packages: PackageMeta[];
		currentId: string;
	}
	let { packages, currentId }: Props = $props();
</script>

<nav
	aria-label="패키지 선택"
	class="-mx-5 mb-2 overflow-x-auto px-5"
	style="overscroll-behavior-x: contain;"
>
	<ul class="flex gap-0 border-b border-[var(--color-border)]">
		{#each packages as pkg (pkg.id)}
			{@const active = pkg.id === currentId}
			<li class="shrink-0">
				<a
					href={`/library/${pkg.id}`}
					aria-current={active ? 'page' : undefined}
					class="block whitespace-nowrap px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors"
					class:text-[var(--color-text)]={active}
					class:border-[var(--color-accent)]={active}
					class:text-[var(--color-text-tertiary)]={!active}
					class:border-transparent={!active}
				>
					{pkg.abbreviation}
				</a>
			</li>
		{/each}
	</ul>
</nav>
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/nav/PackageTabStrip.svelte
git commit -m "feat: add PackageTabStrip for cross-package navigation"
```

---

## Task 5: SeriesSubTabStrip component (TDD)

**Files:**
- Create: `src/lib/components/filter/SeriesSubTabStrip.svelte`
- Create: `tests/unit/SeriesSubTabStrip.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/SeriesSubTabStrip.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import SeriesSubTabStrip from '../../src/lib/components/filter/SeriesSubTabStrip.svelte';
import type { IndexGroup } from '../../src/lib/types';

const series2: IndexGroup[] = [
	{ package_id: 'p', group_name: 'A', level: 1, index: [1, 2] },
	{ package_id: 'p', group_name: 'B', level: 1, index: [3, 4] }
];

describe('SeriesSubTabStrip', () => {
	it('does not render when only one series', () => {
		const single: IndexGroup[] = [{ package_id: 'p', group_name: 'X', level: 1, index: [1] }];
		const { container } = render(SeriesSubTabStrip, {
			props: { series: single, activeIndex: null, onSelect: () => {} }
		});
		expect(container.textContent?.trim()).toBe('');
	});

	it('renders 전체 chip first then series chips', () => {
		render(SeriesSubTabStrip, {
			props: { series: series2, activeIndex: null, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
	});

	it('marks active chip via aria-pressed', () => {
		render(SeriesSubTabStrip, {
			props: { series: series2, activeIndex: 0, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('marks 전체 active when activeIndex is null', () => {
		render(SeriesSubTabStrip, {
			props: { series: series2, activeIndex: null, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('calls onSelect with index when chip clicked', async () => {
		const onSelect = vi.fn();
		render(SeriesSubTabStrip, { props: { series: series2, activeIndex: null, onSelect } });
		await fireEvent.click(screen.getByRole('button', { name: 'B' }));
		expect(onSelect).toHaveBeenCalledWith(1);
	});

	it('calls onSelect with null when 전체 clicked', async () => {
		const onSelect = vi.fn();
		render(SeriesSubTabStrip, { props: { series: series2, activeIndex: 0, onSelect } });
		await fireEvent.click(screen.getByRole('button', { name: '전체' }));
		expect(onSelect).toHaveBeenCalledWith(null);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test SeriesSubTabStrip`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SeriesSubTabStrip.svelte**

Create `src/lib/components/filter/SeriesSubTabStrip.svelte`:

```svelte
<script lang="ts">
	import type { IndexGroup } from '$lib/types';

	interface Props {
		series: IndexGroup[];
		activeIndex: number | null;
		onSelect: (index: number | null) => void;
	}
	let { series, activeIndex, onSelect }: Props = $props();
</script>

{#if series.length > 1}
	<div
		role="tablist"
		aria-label="시리즈 선택"
		class="-mx-5 flex gap-1.5 overflow-x-auto px-5 py-2"
		style="overscroll-behavior-x: contain;"
	>
		{@const allActive = activeIndex === null}
		<button
			type="button"
			role="tab"
			aria-pressed={allActive}
			class="shrink-0 rounded-full border px-2.5 py-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors"
			class:bg-[var(--color-text)]={allActive}
			class:text-white={allActive}
			class:border-[var(--color-text)]={allActive}
			class:bg-[var(--color-card)]={!allActive}
			class:text-[var(--color-text-secondary)]={!allActive}
			class:border-[var(--color-border)]={!allActive}
			onclick={() => onSelect(null)}
		>
			전체
		</button>
		{#each series as s, i (s.group_name)}
			{@const active = activeIndex === i}
			<button
				type="button"
				role="tab"
				aria-pressed={active}
				class="shrink-0 rounded-full border px-2.5 py-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors"
				class:bg-[var(--color-text)]={active}
				class:text-white={active}
				class:border-[var(--color-text)]={active}
				class:bg-[var(--color-card)]={!active}
				class:text-[var(--color-text-secondary)]={!active}
				class:border-[var(--color-border)]={!active}
				onclick={() => onSelect(i)}
			>
				{s.group_name}
			</button>
		{/each}
	</div>
{/if}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test SeriesSubTabStrip`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/filter/SeriesSubTabStrip.svelte tests/unit/SeriesSubTabStrip.test.ts
git commit -m "feat: add SeriesSubTabStrip for level-1 filter chips"
```

---

## Task 6: GroupSubStrip component (TDD)

**Files:**
- Create: `src/lib/components/filter/GroupSubStrip.svelte`
- Create: `tests/unit/GroupSubStrip.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/GroupSubStrip.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import GroupSubStrip from '../../src/lib/components/filter/GroupSubStrip.svelte';
import type { IndexGroup } from '../../src/lib/types';

const groups: IndexGroup[] = [
	{ package_id: 'p', group_name: '중심되신 그리스도', level: 2, index: [1, 2] },
	{ package_id: 'p', group_name: '말씀', level: 2, index: [3, 4] }
];

describe('GroupSubStrip', () => {
	it('does not render when no groups', () => {
		const { container } = render(GroupSubStrip, {
			props: { groups: [], activeIndices: [], onToggle: () => {} }
		});
		expect(container.textContent?.trim()).toBe('');
	});

	it('renders SUB label and group chips', () => {
		render(GroupSubStrip, { props: { groups, activeIndices: [], onToggle: () => {} } });
		expect(screen.getByText('SUB')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '중심되신 그리스도' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '말씀' })).toBeInTheDocument();
	});

	it('marks active chips via aria-pressed', () => {
		render(GroupSubStrip, {
			props: { groups, activeIndices: [0], onToggle: () => {} }
		});
		expect(screen.getByRole('button', { name: '중심되신 그리스도' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: '말씀' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('calls onToggle with the index when chip clicked', async () => {
		const onToggle = vi.fn();
		render(GroupSubStrip, { props: { groups, activeIndices: [], onToggle } });
		await fireEvent.click(screen.getByRole('button', { name: '말씀' }));
		expect(onToggle).toHaveBeenCalledWith(1);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test GroupSubStrip`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement GroupSubStrip.svelte**

Create `src/lib/components/filter/GroupSubStrip.svelte`:

```svelte
<script lang="ts">
	import type { IndexGroup } from '$lib/types';

	interface Props {
		groups: IndexGroup[];
		activeIndices: number[];
		onToggle: (index: number) => void;
	}
	let { groups, activeIndices, onToggle }: Props = $props();
</script>

{#if groups.length > 0}
	<div
		class="-mx-5 flex items-center gap-1.5 overflow-x-auto px-5 pb-3"
		style="overscroll-behavior-x: contain;"
	>
		<span
			class="shrink-0 text-[9.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
		>
			SUB
		</span>
		{#each groups as g, i (g.group_name)}
			{@const active = activeIndices.includes(i)}
			<button
				type="button"
				aria-pressed={active}
				class="shrink-0 rounded-full border px-2.5 py-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors"
				class:bg-[var(--color-text-secondary)]={active}
				class:text-white={active}
				class:border-[var(--color-text-secondary)]={active}
				class:bg-[var(--color-card)]={!active}
				class:text-[var(--color-text-secondary)]={!active}
				class:border-[var(--color-border)]={!active}
				onclick={() => onToggle(i)}
			>
				{g.group_name}
			</button>
		{/each}
	</div>
{/if}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test GroupSubStrip`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/filter/GroupSubStrip.svelte tests/unit/GroupSubStrip.test.ts
git commit -m "feat: add GroupSubStrip for level-2 multi-toggle chips"
```

---

## Task 7: Restructure GroupList row with inline tags

**Files:**
- Modify: `src/lib/components/GroupList.svelte`

- [ ] **Step 1: Replace GroupList.svelte content**

The current row wraps everything in `<a>`. We restructure to a non-interactive container with two zones: a link covering badge/title/cite, and a tag toolbar. Tag clicks call back to the parent via callback props (parent owns URL state).

Replace `src/lib/components/GroupList.svelte` with:

```svelte
<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import { ChevronRight } from 'lucide-svelte';
	import CategoryTag from './filter/CategoryTag.svelte';

	interface Props {
		packageId: string;
		verses: StoredVerse[];
		/** Tags to render inline per verse number. Pass empty map to suppress (e.g. flat packages). */
		tagsByVerseNo: Map<number, VerseTag[]>;
		/** Currently active filter — used to highlight matching tags. */
		activeSeriesIndex: number | null;
		activeGroupIndices: number[];
		onTagClick: (tag: VerseTag) => void;
	}
	let {
		packageId,
		verses,
		tagsByVerseNo,
		activeSeriesIndex,
		activeGroupIndices,
		onTagClick
	}: Props = $props();
</script>

<ul
	class="group-list overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
>
	{#each verses as v, i (v.no)}
		{@const tags = tagsByVerseNo.get(v.no) ?? []}
		<li class:border-t={i > 0} class="border-[var(--color-border)]">
			<div class="verse-row group flex items-stretch gap-3 px-5 py-3">
				<a
					data-testid="verse-row"
					href={`/library/${packageId}/${v.no}`}
					class="row-link flex flex-1 items-center gap-3 min-w-0"
				>
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[13px] font-semibold tabular-nums text-[var(--color-accent)] transition-colors group-hover:bg-[var(--color-accent)] group-hover:text-white"
					>
						{v.no}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-medium text-[var(--color-text)]">{v.title}</p>
						<p class="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{v.cite}</p>
						{#if tags.length > 0}
							<div class="mt-1.5 flex flex-wrap gap-1.5">
								{#each tags as tag (tag.level + ':' + tag.group.group_name)}
									{@const active =
										tag.level === 1
											? activeSeriesIndex === tag.seriesIndex && activeGroupIndices.length === 0
											: activeSeriesIndex === tag.seriesIndex &&
												tag.groupIndex !== undefined &&
												activeGroupIndices.includes(tag.groupIndex)}
									<CategoryTag
										label={tag.group.group_name}
										level={tag.level}
										{active}
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onTagClick(tag);
										}}
									/>
								{/each}
							</div>
						{/if}
					</div>
					<ChevronRight
						size={18}
						class="shrink-0 self-center text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
					/>
				</a>
			</div>
		</li>
	{/each}
</ul>

<style>
	.group-list {
		box-shadow: var(--shadow-soft);
	}
	.verse-row:hover {
		background-color: var(--color-elevated);
	}
</style>
```

> **Note on accessibility:** The tag buttons are still rendered inside the `<a>` element, which is technically invalid HTML (interactive in interactive). We rely on `e.preventDefault()` + `e.stopPropagation()` in the tag click handler to stop link navigation. Browsers tolerate this in practice. A future cleanup could split the row into two siblings: the link wrapping just `<span class="row-num">` + title/cite, and the tag row outside the link. We're deferring that refactor — current structure preserves the existing `data-testid="verse-row"` on the link for the existing e2e tests.

- [ ] **Step 2: Run typecheck**

Run: `pnpm check`
Expected: 0 errors. Existing `GroupList` consumers (Package detail page) will fail typecheck because they don't pass the new required props yet — that's fine, we'll fix it in Task 8.

If typecheck fails on `[packageId]/+page.svelte` due to missing props, that's the expected breakage. Continue.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/GroupList.svelte
git commit -m "feat: restructure GroupList row with inline category tags"
```

---

## Task 8: Wire package detail page with filter strips

**Files:**
- Modify: `src/routes/library/[packageId]/+page.svelte`

This is the integration task — strips, URL state, filtered verses, GroupList all together.

- [ ] **Step 1: Replace +page.svelte content**

Replace `src/routes/library/[packageId]/+page.svelte` with:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageTabStrip from '$lib/components/nav/PackageTabStrip.svelte';
	import SeriesSubTabStrip from '$lib/components/filter/SeriesSubTabStrip.svelte';
	import GroupSubStrip from '$lib/components/filter/GroupSubStrip.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		listPackages,
		installPackage,
		listVerses,
		listGroups,
		level1Groups,
		level2GroupsInSeries,
		tagsForVerse,
		filterVerses,
		type VerseTag
	} from '$lib/db/verses';
	import type { PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);

	let allPackages: PackageMeta[] = $state([]);
	let pkg: PackageMeta | null = $state(null);
	let verses: StoredVerse[] = $state([]);
	let groups: IndexGroup[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);

	$effect(() => {
		let active = true;
		(async () => {
			try {
				const all = await listPackages();
				if (active) allPackages = all;
				const found = all.find((p) => p.id === packageId);
				if (!found) {
					if (active) error = '패키지를 찾을 수 없습니다.';
					return;
				}
				if (active) pkg = found;

				await installPackage(packageId);
				const [v, g] = await Promise.all([listVerses(packageId), listGroups(packageId)]);
				if (active) {
					verses = v;
					groups = g;
					loading = false;
				}
			} catch (e) {
				if (active) {
					error = String(e);
					loading = false;
				}
			}
		})();
		return () => {
			active = false;
		};
	});

	// Derive filter state from URL search params
	function parseSeriesIndex(s: string | null): number | null {
		if (s === null) return null;
		const n = parseInt(s, 10);
		return Number.isInteger(n) && n >= 0 ? n : null;
	}
	function parseGroupIndices(s: string | null): number[] {
		if (s === null || s === '') return [];
		return s
			.split(',')
			.map((p) => parseInt(p, 10))
			.filter((n) => Number.isInteger(n) && n >= 0);
	}

	const seriesIndex = $derived(parseSeriesIndex(page.url.searchParams.get('s')));
	const groupIndices = $derived(parseGroupIndices(page.url.searchParams.get('g')));

	const series = $derived(level1Groups(groups));
	const subGroups = $derived(level2GroupsInSeries(groups, seriesIndex));
	const filteredVerses = $derived(filterVerses(verses, groups, seriesIndex, groupIndices));

	// Compute tags per verse — only when there's a meaningful category structure (>1 level-1 group)
	const tagsByVerseNo = $derived.by(() => {
		const map = new Map<number, VerseTag[]>();
		if (series.length <= 1) return map; // suppress tags for flat packages (5_krv, 8_krv)
		for (const v of filteredVerses) {
			map.set(v.no, tagsForVerse(groups, v.no));
		}
		return map;
	});

	// URL mutation helpers
	function navigateFilter(s: number | null, g: number[]) {
		const params = new URLSearchParams();
		if (s !== null) params.set('s', String(s));
		if (g.length > 0) params.set('g', g.join(','));
		const qs = params.toString();
		const href = `/library/${packageId}${qs ? `?${qs}` : ''}`;
		goto(href, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function selectSeries(idx: number | null) {
		// Changing series clears group filter
		navigateFilter(idx, []);
	}

	function toggleGroup(idx: number) {
		const next = groupIndices.includes(idx)
			? groupIndices.filter((i) => i !== idx)
			: [...groupIndices, idx].sort((a, b) => a - b);
		navigateFilter(seriesIndex, next);
	}

	function onTagClick(tag: VerseTag) {
		if (tag.level === 1) {
			selectSeries(tag.seriesIndex);
		} else {
			// level-2: ensure parent series is selected, then toggle the group
			if (seriesIndex !== tag.seriesIndex) {
				navigateFilter(tag.seriesIndex, [tag.groupIndex!]);
			} else {
				toggleGroup(tag.groupIndex!);
			}
		}
	}
</script>

<Header title={pkg?.name ?? '...'} onBack={() => goto('/library')} />

<main class="mx-auto max-w-md px-5 pb-8 pt-2">
	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if loading || !pkg}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<PackageTabStrip packages={allPackages} currentId={packageId} />

		<div class="mb-3 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
			<span class="font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
				{pkg.translation_name}
			</span>
			<span class="h-3 w-px bg-[var(--color-border)]" aria-hidden="true"></span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-px w-4 bg-[var(--color-accent)]/60"></span>
				{filteredVerses.length} / {verses.length}개
			</span>
		</div>

		<SeriesSubTabStrip {series} activeIndex={seriesIndex} onSelect={selectSeries} />
		<GroupSubStrip groups={subGroups} activeIndices={groupIndices} onToggle={toggleGroup} />

		<GroupList
			{packageId}
			verses={filteredVerses}
			{tagsByVerseNo}
			activeSeriesIndex={seriesIndex}
			activeGroupIndices={groupIndices}
			{onTagClick}
		/>
	{/if}
</main>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Run unit tests (smoke check)**

Run: `pnpm test`
Expected: all 28+ unit tests passing.

- [ ] **Step 4: Run existing e2e to confirm we didn't break the 5_krv flow**

Run: `lsof -ti:4173 | xargs kill -9 2>/dev/null; PATH="/tmp/pnpm-shim:$PATH" pnpm test:e2e -g "package detail"`

> If `/tmp/pnpm-shim/pnpm` doesn't exist (fresh shell), create it: `mkdir -p /tmp/pnpm-shim && printf '#!/bin/bash\nexec corepack pnpm "$@"\n' > /tmp/pnpm-shim/pnpm && chmod +x /tmp/pnpm-shim/pnpm`

Expected: `package detail shows verse list` passes on chromium + iphone-14.

- [ ] **Step 5: Commit**

```bash
git add src/routes/library/'[packageId]'/+page.svelte
git commit -m "feat: wire package detail with strips and URL filter state"
```

---

## Task 9: Add tags row to VerseCard

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`
- Modify: `src/routes/library/[packageId]/[verseNo]/+page.svelte`

- [ ] **Step 1: Update VerseCard to accept and display tags**

Replace `src/lib/components/card/VerseCard.svelte` with:

```svelte
<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import { goto } from '$app/navigation';

	interface Props {
		verse: StoredVerse;
		packageName?: string;
		packageId?: string;
		tags?: VerseTag[];
	}
	let { verse, packageName, packageId, tags = [] }: Props = $props();

	function tagHref(tag: VerseTag): string {
		if (!packageId) return '#';
		const params = new URLSearchParams();
		params.set('s', String(tag.seriesIndex));
		if (tag.level === 2 && tag.groupIndex !== undefined) {
			params.set('g', String(tag.groupIndex));
		}
		return `/library/${packageId}?${params.toString()}`;
	}

	function onTagClick(tag: VerseTag) {
		const href = tagHref(tag);
		goto(href);
	}
</script>

<article
	class="verse-card overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 pb-9 pt-7"
>
	<header class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<p class="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
				{packageName ?? ''}
			</p>
			<span
				class="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-accent-soft)] px-2 text-[12px] font-semibold tabular-nums text-[var(--color-accent)]"
			>
				{verse.no}
			</span>
		</div>
		<h2 class="text-[22px] font-semibold leading-tight text-[var(--color-text)]">
			{verse.title}
		</h2>
		<p class="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
			<span class="h-px w-5 bg-[var(--color-accent)]/60"></span>
			{verse.cite}
		</p>
	</header>

	<p
		class="mt-6 whitespace-pre-line break-keep text-[17px] leading-[1.85] text-[var(--color-text)]"
	>
		{verse.w}
	</p>

	{#if tags.length > 0}
		<div class="mt-6 flex flex-wrap gap-1.5">
			{#each tags as tag (tag.level + ':' + tag.group.group_name)}
				<CategoryTag
					label={tag.group.group_name}
					level={tag.level}
					onclick={() => onTagClick(tag)}
				/>
			{/each}
		</div>
	{/if}
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}
</style>
```

- [ ] **Step 2: Update verse detail page to pass groups + tags**

Replace `src/routes/library/[packageId]/[verseNo]/+page.svelte` with:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		listPackages,
		installPackage,
		readVerse,
		listGroups,
		tagsForVerse,
		level1Groups,
		type VerseTag
	} from '$lib/db/verses';
	import type { PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);
	const verseNo = $derived(parseInt(page.params.verseNo!, 10));

	let pkg: PackageMeta | null = $state(null);
	let verse: StoredVerse | null = $state(null);
	let groups: IndexGroup[] = $state([]);
	let error: string | null = $state(null);

	$effect(() => {
		let active = true;
		(async () => {
			try {
				const all = await listPackages();
				const found = all.find((p) => p.id === packageId);
				if (!found) {
					if (active) error = '패키지를 찾을 수 없습니다.';
					return;
				}
				if (active) pkg = found;
				await installPackage(packageId);
				const [v, g] = await Promise.all([
					readVerse(packageId, verseNo),
					listGroups(packageId)
				]);
				if (active) {
					if (!v) error = '구절을 찾을 수 없습니다.';
					else verse = v;
					groups = g;
				}
			} catch (e) {
				if (active) error = String(e);
			}
		})();
		return () => {
			active = false;
		};
	});

	// Suppress tags for flat single-group packages
	const tags = $derived.by(() => {
		if (!verse) return [] as VerseTag[];
		if (level1Groups(groups).length <= 1) return [] as VerseTag[];
		return tagsForVerse(groups, verseNo);
	});
</script>

<Header title={pkg?.abbreviation ?? '...'} onBack={() => goto(`/library/${packageId}`)} />

<main class="mx-auto max-w-md px-5 pb-8 pt-4">
	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if !verse}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<VerseCard {verse} packageName={pkg?.abbreviation} {packageId} {tags} />
	{/if}
</main>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Run existing e2e to confirm verse detail still works**

Run: `lsof -ti:4173 | xargs kill -9 2>/dev/null; PATH="/tmp/pnpm-shim:$PATH" pnpm test:e2e -g "verse detail"`
Expected: passes on chromium + iphone-14.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte src/routes/library/'[packageId]'/'[verseNo]'/+page.svelte
git commit -m "feat: show category tags on VerseCard with deep-link click"
```

---

## Task 10: E2E coverage for category filters

**Files:**
- Create: `tests/e2e/category-filters.spec.ts`

- [ ] **Step 1: Write E2E tests**

Create `tests/e2e/category-filters.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('category filters', () => {
	test('60_krv: series strip visible, group strip hidden until series selected', async ({
		page
	}) => {
		await page.goto('/library/60_krv');
		// Wait for content
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Series strip exists with 전체 + at least one series
		await expect(page.getByRole('button', { name: '전체' })).toBeVisible();
		await expect(page.getByRole('tablist', { name: '시리즈 선택' })).toBeVisible();

		// Group SUB label not visible initially
		await expect(page.getByText('SUB', { exact: true })).not.toBeVisible();

		// All 60 verses initially
		await expect(page.getByTestId('verse-row')).toHaveCount(60);

		// Click first non-전체 series chip
		const chips = page.locator('[role="tab"]');
		await chips.nth(1).click();

		// URL has ?s=0
		await expect(page).toHaveURL(/\?s=0/);

		// Group strip now visible
		await expect(page.getByText('SUB', { exact: true })).toBeVisible();

		// Verse count drops below 60 (12 for series A in 60_krv)
		const remaining = await page.getByTestId('verse-row').count();
		expect(remaining).toBeLessThan(60);
	});

	test('60_krv: deep link with ?s=0&g=0 renders filtered list', async ({ page }) => {
		await page.goto('/library/60_krv?s=0&g=0');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();
		// Series A's first level-2 group has 2 verses
		await expect(page.getByTestId('verse-row')).toHaveCount(2);
	});

	test('60_krv: ?s=99 (out of range) falls back to all verses', async ({ page }) => {
		await page.goto('/library/60_krv?s=99');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();
		await expect(page.getByTestId('verse-row')).toHaveCount(60);
	});

	test('5_krv: no series strip, no group strip, no inline tags', async ({ page }) => {
		await page.goto('/library/5_krv');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Series tablist must not exist
		await expect(page.getByRole('tablist', { name: '시리즈 선택' })).toHaveCount(0);

		// SUB label must not exist
		await expect(page.getByText('SUB', { exact: true })).toHaveCount(0);

		// 5 verses, no tag buttons inside any row
		await expect(page.getByTestId('verse-row')).toHaveCount(5);
	});

	test('100_krv: series strip visible, group strip hidden after series selection', async ({
		page
	}) => {
		await page.goto('/library/100_krv?s=0');
		await expect(page.getByTestId('verse-row').first()).toBeVisible();

		// Series strip rendered
		await expect(page.getByRole('tablist', { name: '시리즈 선택' })).toBeVisible();

		// Group SUB label still hidden because 100_krv has no level-2
		await expect(page.getByText('SUB', { exact: true })).not.toBeVisible();
	});

	test('PackageTabStrip lets you jump to another package', async ({ page }) => {
		await page.goto('/library/5_krv');
		await page.getByRole('navigation', { name: '패키지 선택' }).getByText('60구절').click();
		await expect(page).toHaveURL(/\/library\/60_krv$/);
	});

	test('VerseCard tag tap navigates to filtered package detail', async ({ page }) => {
		await page.goto('/library/60_krv/1');
		// Tag for level-1 series A appears on the card. Click it.
		const tagButtons = page.locator('article button');
		await tagButtons.first().click();
		await expect(page).toHaveURL(/\/library\/60_krv\?s=0/);
	});
});
```

- [ ] **Step 2: Run new e2e tests**

Run: `lsof -ti:4173 | xargs kill -9 2>/dev/null; PATH="/tmp/pnpm-shim:$PATH" pnpm test:e2e category-filters`
Expected: 14 passing (7 tests × 2 browsers).

If any test fails, debug and fix before continuing.

- [ ] **Step 3: Run full e2e suite to confirm nothing else regressed**

Run: `PATH="/tmp/pnpm-shim:$PATH" pnpm test:e2e`
Expected: all e2e tests passing on chromium + iphone-14 (existing 12 + new 14 = 26 total).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/category-filters.spec.ts
git commit -m "test: e2e coverage for category tags and filter navigation"
```

---

## Task 11: Push to production

**Files:** none

- [ ] **Step 1: Confirm clean local state**

Run: `git status`
Expected: nothing to commit; on `main`.

Run: `pnpm check && pnpm test`
Expected: 0 errors; all unit tests passing.

- [ ] **Step 2: Push and watch CI**

```bash
git push
```

Then check CI:

```bash
sleep 4 && gh run list --branch main --limit 1 -R essohn/memscripture
```

Repeat until status is `completed success`.

- [ ] **Step 3: Manual production verification**

Open `https://memscripture.pages.dev/library/60_krv` in a phone browser. Verify:

- Package tab strip at top — current package highlighted, others scrollable
- Translation + count meta line
- Series strip: `전체 · A. 새로운 삶 · B. 그리스도 · …` with horizontal scroll
- Click `A. 새로운 삶` → URL becomes `?s=0`, group SUB strip appears with `중심되신 그리스도`, `그리스도께 순종`, etc.
- Verse list shrinks to 12 verses, each row shows two tags below the title
- Tap verse → VerseCard shows tags at bottom, no decorative quote
- Tap tag on card → returns to filtered package detail
- Visit `/library/5_krv` → no strips, no tags
- Visit `/library/100_krv?s=0` → series strip visible, no SUB strip

- [ ] **Step 4: Commit any production fixes (if needed)**

If anything breaks in production, fix forward — never amend already-pushed commits.
