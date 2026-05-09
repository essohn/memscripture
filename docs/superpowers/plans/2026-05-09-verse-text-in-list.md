# Show Verse Text in List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the full Bible verse body under each row in the package detail list, with an inline Eye/EyeOff toggle that persists the user's preference (default ON).

**Architecture:** A new `db/viewOptions.ts` module wraps a single `view_options` row in Dexie's `settings` table, returning typed defaults for unknown / malformed values. `GroupList.svelte` accepts a presentation-only `showVerseText` prop. `library/[packageId]/+page.svelte` owns the state — loads it on mount, renders the toggle in the existing meta row, fire-and-forget persists on change.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes (`$state`, `$effect`, `$derived`), Dexie, Tailwind v4, lucide-svelte, Vitest + @testing-library/svelte, fake-indexeddb.

**Spec:** [docs/superpowers/specs/2026-05-09-verse-text-in-list-design.md](../specs/2026-05-09-verse-text-in-list-design.md)

---

## File Structure

**Create:**
- `src/lib/db/viewOptions.ts` — read/write the `view_options` row with typed defaults and validation
- `tests/unit/viewOptions.test.ts` — round-trip and validation tests

**Modify:**
- `src/lib/components/GroupList.svelte` — add `showVerseText` prop, conditionally render `v.w` between cite and tags
- `tests/unit/GroupList.test.ts` — NEW (no existing test for this component) — verify the prop controls body rendering
- `src/routes/library/[packageId]/+page.svelte` — `$state` for the toggle, load on mount, render Eye/EyeOff button, pass prop down

Each file has one responsibility. The component stays presentation-only (no Dexie reads), the persistence module stays IO-only (no UI), the page wires them together.

---

## Task 1: `viewOptions` persistence module

**Files:**
- Create: `src/lib/db/viewOptions.ts`
- Create: `tests/unit/viewOptions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/viewOptions.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import { getShowVerseTextInList, setShowVerseTextInList } from '../../src/lib/db/viewOptions';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('viewOptions', () => {
	it('returns default true when no record exists', async () => {
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('round-trips false', async () => {
		await setShowVerseTextInList(false);
		expect(await getShowVerseTextInList()).toBe(false);
	});

	it('round-trips back to true', async () => {
		await setShowVerseTextInList(false);
		await setShowVerseTextInList(true);
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('returns default when stored value is not a boolean', async () => {
		await db.settings.put({ key: 'view_options', value: { showVerseTextInList: 'yes' } });
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('returns default when stored row is malformed (not an object)', async () => {
		await db.settings.put({ key: 'view_options', value: 'broken' });
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('preserves unrelated keys when writing', async () => {
		await db.settings.put({
			key: 'view_options',
			value: { showVerseTextInList: true, futureFlag: 42 }
		});
		await setShowVerseTextInList(false);
		const entry = await db.settings.get('view_options');
		expect(entry?.value).toEqual({ showVerseTextInList: false, futureFlag: 42 });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test viewOptions`
Expected: FAIL with module not found / `getShowVerseTextInList is not a function`.

- [ ] **Step 3: Implement the module**

Create `src/lib/db/viewOptions.ts`:

```ts
import { db } from './local';

const KEY = 'view_options';

export interface ViewOptions {
	showVerseTextInList: boolean;
}

const DEFAULTS: ViewOptions = {
	showVerseTextInList: true
};

async function readRaw(): Promise<Record<string, unknown>> {
	const entry = await db.settings.get(KEY);
	const value = entry?.value;
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export async function getShowVerseTextInList(): Promise<boolean> {
	const raw = await readRaw();
	const v = raw.showVerseTextInList;
	return typeof v === 'boolean' ? v : DEFAULTS.showVerseTextInList;
}

export async function setShowVerseTextInList(v: boolean): Promise<void> {
	const raw = await readRaw();
	await db.settings.put({ key: KEY, value: { ...raw, showVerseTextInList: v } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test viewOptions`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/viewOptions.ts tests/unit/viewOptions.test.ts
git commit -m "feat(db): add viewOptions module with showVerseTextInList preference"
```

---

## Task 2: `GroupList` accepts `showVerseText` prop

**Files:**
- Modify: `src/lib/components/GroupList.svelte`
- Create: `tests/unit/GroupList.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/GroupList.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import GroupList from '../../src/lib/components/GroupList.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verses: StoredVerse[] = [
	{
		package_id: 'pkg',
		no: 1,
		i: 1,
		title: '중심되신 그리스도',
		cite: '고후 5:17',
		w: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라'
	}
];

const baseProps = {
	packageId: 'pkg',
	verses,
	tagsByVerseNo: new Map(),
	activeSeriesIndex: null,
	activeGroupIndices: [],
	onTagClick: () => {}
};

describe('GroupList', () => {
	it('renders verse body when showVerseText=true', () => {
		render(GroupList, { props: { ...baseProps, showVerseText: true } });
		expect(
			screen.getByText('그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라')
		).toBeInTheDocument();
	});

	it('does not render verse body when showVerseText=false', () => {
		render(GroupList, { props: { ...baseProps, showVerseText: false } });
		expect(
			screen.queryByText('그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라')
		).toBeNull();
	});

	it('does not render an empty paragraph when v.w is empty', () => {
		const empty: StoredVerse[] = [{ ...verses[0], w: '' }];
		const { container } = render(GroupList, {
			props: { ...baseProps, verses: empty, showVerseText: true }
		});
		// the body paragraph uses leading-[1.55]; if absent, no element should match.
		expect(container.querySelector('p[class*="leading-[1.55]"]')).toBeNull();
	});

	it('still renders title and cite regardless of showVerseText', () => {
		render(GroupList, { props: { ...baseProps, showVerseText: false } });
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test GroupList`
Expected: FAIL — props type mismatch / body text not found.

- [ ] **Step 3: Add the prop and conditional render**

Modify `src/lib/components/GroupList.svelte`. Update the `Props` interface and destructuring:

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
		/** When true, render the full Bible verse body (`v.w`) under the cite line. */
		showVerseText: boolean;
	}
	let {
		packageId,
		verses,
		tagsByVerseNo,
		activeSeriesIndex,
		activeGroupIndices,
		onTagClick,
		showVerseText
	}: Props = $props();
</script>
```

Then in the row body, insert the verse body between the cite paragraph and the tags block:

```svelte
<div class="min-w-0 flex-1">
	<p class="truncate text-[15px] font-medium text-[var(--color-text)]">{v.title}</p>
	<p class="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{v.cite}</p>
	{#if showVerseText && v.w}
		<p class="mt-1 text-[13px] leading-[1.55] text-[var(--color-text-secondary)]">{v.w}</p>
	{/if}
	{#if tags.length > 0}
		<div class="mt-1.5 flex flex-wrap gap-1.5">
			<!-- existing tag rendering unchanged -->
```

(Keep the rest of the file — circle, chevron, hover styles, `<style>` block — exactly as it is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test GroupList`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Verify type check passes**

Run: `pnpm check`
Expected: PASS — no Svelte/TypeScript errors. (`showVerseText` is now a required prop, so any caller that hasn't been updated will be flagged. The only caller is `library/[packageId]/+page.svelte`, which we update in Task 3 — expect ONE error here pointing at that file. That is correct and the next task fixes it.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/GroupList.svelte tests/unit/GroupList.test.ts
git commit -m "feat(GroupList): conditionally render verse body via showVerseText prop"
```

---

## Task 3: Wire toggle into package detail page

**Files:**
- Modify: `src/routes/library/[packageId]/+page.svelte`

No new test file — the wiring is covered in aggregate by the existing `tests/e2e/library.spec.ts`. We will run that e2e at the end as a smoke check.

- [ ] **Step 1: Add the imports**

In `src/routes/library/[packageId]/+page.svelte`, extend the existing imports section:

```svelte
<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageTabStrip from '$lib/components/nav/PackageTabStrip.svelte';
	import SeriesSubTabStrip from '$lib/components/filter/SeriesSubTabStrip.svelte';
	import GroupSubStrip from '$lib/components/filter/GroupSubStrip.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		listPackages,
		loadPackageData,
		level1Groups,
		level2GroupsInSeries,
		filterVerses,
		type VerseTag
	} from '$lib/db/verses';
	import { recordPackageView } from '$lib/db/recent';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import type { PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';
```

- [ ] **Step 2: Add state + load + toggle function**

Right after the existing `let error: string | null = $state(null);` line, add:

```svelte
	let showVerseText = $state(true);
```

Inside the existing mount `$effect`, immediately after `if (active) allPackages = all;`, add the load. The cleanest place is parallel to the package lookup — load the preference but don't block the package render on it:

```svelte
			$effect(() => {
				let active = true;
				const currentPackageId = packageId; // snapshot for effect closure
				const currentPkg = untrack(() => pkg);
				if (currentPkg && currentPkg.id !== currentPackageId) {
					pkg = null;
					verses = [];
					groups = [];
					error = null;
				}
				loading = true;
				// Load view preference (fire-and-forget, default already applied)
				getShowVerseTextInList()
					.then((v) => {
						if (active) showVerseText = v;
					})
					.catch(() => {});
				(async () => {
					// ...existing body unchanged
```

Then add the toggle handler after the existing `onTagClick` function:

```svelte
	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}
```

- [ ] **Step 3: Render the toggle button in the meta row**

Update the meta row block. Current:

```svelte
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
```

Add an `ml-auto` button at the end (still inside the same flex row):

```svelte
		<div class="mb-3 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
			<span class="font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
				{pkg.translation_name}
			</span>
			<span class="h-3 w-px bg-[var(--color-border)]" aria-hidden="true"></span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-px w-4 bg-[var(--color-accent)]/60"></span>
				{filteredVerses.length} / {verses.length}개
			</span>
			<button
				type="button"
				onclick={toggleVerseText}
				aria-pressed={showVerseText}
				aria-label={showVerseText ? '구절 본문 표시 끄기' : '구절 본문 표시 켜기'}
				class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
			>
				{#if showVerseText}
					<Eye size={16} />
				{:else}
					<EyeOff size={16} />
				{/if}
			</button>
		</div>
```

- [ ] **Step 4: Pass `showVerseText` to `<GroupList>`**

Update the existing `<GroupList>` call at the bottom of the template:

```svelte
			<GroupList
				{packageId}
				verses={filteredVerses}
				{tagsByVerseNo}
				activeSeriesIndex={seriesIndex}
				activeGroupIndices={groupIndices}
				{onTagClick}
				{showVerseText}
			/>
```

- [ ] **Step 5: Run the type check**

Run: `pnpm check`
Expected: PASS — zero errors. (The Task 2 error about `<GroupList>` missing `showVerseText` is now resolved.)

- [ ] **Step 6: Run all unit tests**

Run: `pnpm test`
Expected: PASS — viewOptions tests, GroupList tests, and all pre-existing tests stay green.

- [ ] **Step 7: Manual smoke test in dev server**

Run: `pnpm dev` — open the printed local URL, navigate to any package under `/library/<id>`. Verify:
1. Verse body text appears under each cite line on first load (default ON).
2. The Eye icon is at the right edge of the meta row ("X / X개" line).
3. Tap the Eye → it becomes EyeOff and all verse bodies disappear.
4. Tap EyeOff → bodies reappear.
5. Reload the page — preference persists.
6. Navigate to a different package — preference persists across packages.
7. With bodies hidden, scroll behavior and tag chips render exactly as before.

If any check fails, stop and diagnose. Do NOT proceed to commit until all checks pass.

- [ ] **Step 8: Run the existing e2e suite as a regression check**

Run: `pnpm test:e2e tests/e2e/library.spec.ts`
Expected: PASS — the existing library navigation tests should still pass since the toggle is additive and the row structure is unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/routes/library/\[packageId\]/+page.svelte
git commit -m "feat(library): add Eye/EyeOff toggle for verse body in list"
```

---

## Self-Review

Spec coverage check:

| Spec section | Implemented in |
|---|---|
| `db/viewOptions.ts` reader/writer with default true and validation | Task 1 |
| Object-shaped `ViewOptions` value, preserves unrelated keys on write | Task 1 (test "preserves unrelated keys") |
| `GroupList` accepts `showVerseText` prop, presentation-only | Task 2 |
| Body renders only when `showVerseText && v.w` | Task 2 (test "does not render an empty paragraph") |
| Body styling: 13px, secondary color, `leading-[1.55]`, between cite and tags | Task 2 Step 3 |
| `library/[packageId]` owns `$state`, loads on mount, default true before resolve | Task 3 Step 2 |
| Toggle in existing meta row, right-aligned, Eye/EyeOff lucide icons | Task 3 Step 3 |
| `aria-pressed`, Korean `aria-label` | Task 3 Step 3 |
| Fire-and-forget save on toggle | Task 3 Step 2 (`toggleVerseText`) |
| Preference persists across packages and reloads | Task 3 Step 7 (manual checks 5–6) |

Out-of-scope items (Settings page toggle, font controls, animations, per-package override) are correctly absent from the plan.

No placeholders detected. All steps include concrete code, exact paths, exact commands, and expected outcomes. Type and method names are consistent across tasks (`getShowVerseTextInList` / `setShowVerseTextInList` / `showVerseText` / `toggleVerseText`).
