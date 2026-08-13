# Swipe Curtain Memorization Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing tap-to-reveal-clauses memorize mode in `VerseCard` with a swipe-curtain that masks every word with a striped box and reveals words in reading order via horizontal drag.

**Architecture:** A new pure helper `splitVerseWords` splits the verse body by whitespace. `VerseCard` keeps `mode`/`revealedCount` state but drives reveal from horizontal pointer-drag distance instead of cue-button taps. Each word is wrapped in a span with a striped CSS overlay that fades out (150ms) when its index is below `revealedCount`. The drag is a relative scrub: each `pointerdown` records baseline; horizontal delta adjusts count; vertical-leaning gestures release pointer capture so the page can scroll.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes) / TypeScript / Tailwind v4 / Pointer Events API / Vitest / @testing-library/svelte / Playwright

**Spec:** [docs/superpowers/specs/2026-05-08-swipe-curtain-memorization-mode-design.md](../specs/2026-05-08-swipe-curtain-memorization-mode-design.md)

---

## File Structure

```
src/lib/utils/chunk.ts                EDIT  add splitVerseWords() (keep splitVerseText)
tests/unit/chunk.test.ts              EDIT  add tests for splitVerseWords
src/lib/components/card/VerseCard.svelte   EDIT  replace chunk-reveal with curtain-drag
tests/unit/VerseCard.test.ts          EDIT  rewrite mode tests for word-span model
tests/e2e/memorize.spec.ts            EDIT  rewrite for drag interaction
```

The clause-based `splitVerseText` and its 12 existing unit tests remain in place (spec decision: kept for potential future use, no longer imported by `VerseCard`).

---

## Task 1: Add splitVerseWords helper (TDD)

**Files:**
- Modify: `src/lib/utils/chunk.ts`
- Modify: `tests/unit/chunk.test.ts`

- [ ] **Step 1: Append failing tests for splitVerseWords**

Add the following block at the end of `tests/unit/chunk.test.ts` (after the existing `describe('splitVerseText', …)` block, inside the file but as a new top-level `describe`):

```ts
import { splitVerseWords } from '../../src/lib/utils/chunk';

describe('splitVerseWords', () => {
	it('returns [] for empty input', () => {
		expect(splitVerseWords('')).toEqual([]);
	});

	it('returns [] for whitespace-only input', () => {
		expect(splitVerseWords('   \n  ')).toEqual([]);
	});

	it('splits a Korean Bible verse on whitespace into individual word tokens', () => {
		expect(
			splitVerseWords('너는 마음을 다하여 여호와를 의뢰하고')
		).toEqual(['너는', '마음을', '다하여', '여호와를', '의뢰하고']);
	});

	it('collapses runs of whitespace and trims edges', () => {
		expect(splitVerseWords('  hello   world\n\nfoo  ')).toEqual([
			'hello',
			'world',
			'foo'
		]);
	});

	it('keeps trailing punctuation attached to the word', () => {
		expect(splitVerseWords('첫 문장이라, 다음으로')).toEqual([
			'첫',
			'문장이라,',
			'다음으로'
		]);
	});

	it('returns a single-item array for one word with no whitespace', () => {
		expect(splitVerseWords('말씀')).toEqual(['말씀']);
	});
});
```

Note: the import statement goes at the top of the file alongside the existing `import { splitVerseText }` import. Combine them into a single import line:

```ts
import { splitVerseText, splitVerseWords } from '../../src/lib/utils/chunk';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `corepack pnpm test chunk`
Expected: 6 new failing tests in `splitVerseWords` describe block — all fail with `splitVerseWords is not a function` or similar import error. The 12 existing `splitVerseText` tests should still pass.

- [ ] **Step 3: Implement splitVerseWords**

Open `src/lib/utils/chunk.ts` and append at the end of the file (after the existing `mergeShortChunks` function):

```ts
/**
 * Split a verse body into individual whitespace-delimited words.
 * Each token (including any trailing punctuation) becomes one item.
 * Empty/whitespace-only input returns an empty array.
 */
export function splitVerseWords(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	return trimmed.split(/\s+/).filter(Boolean);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `corepack pnpm test chunk`
Expected: 18 tests passing (12 existing `splitVerseText` + 6 new `splitVerseWords`).

- [ ] **Step 5: Run full check**

Run: `corepack pnpm check && corepack pnpm test`
Expected: 0 typecheck errors; full unit suite passing (was 63 + 6 new = 69).

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/chunk.ts tests/unit/chunk.test.ts
git commit -m "feat: add splitVerseWords helper for per-word reveal"
```

---

## Task 2: Rewrite VerseCard for swipe-curtain mode

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`
- Modify: `tests/unit/VerseCard.test.ts`

This task replaces the existing chunk-reveal UI with the swipe-curtain UI. The existing component-level tests for `mode` toggling and `처음부터 다시 / 전체 보기 / 암송 종료` are kept conceptually but rewritten to assert against word-span rendering instead of paragraph-chunk rendering. Drag-gesture tests are deferred to Task 3 (e2e).

- [ ] **Step 1: Rewrite the unit test file**

Replace the entire content of `tests/unit/VerseCard.test.ts` with:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verse: StoredVerse = {
	package_id: 'p',
	no: 1,
	i: 1,
	title: '제목',
	cite: '잠언 3:5-6',
	w: '너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라'
};

const shortVerse: StoredVerse = {
	...verse,
	w: '말씀'
};

function getCoveredCount(container: HTMLElement): number {
	return container.querySelectorAll('.word.covered').length;
}

function getRevealedWordTexts(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>('.word:not(.covered) .word-text')
	).map((el) => el.textContent ?? '');
}

describe('VerseCard swipe curtain memorize mode', () => {
	it('starts in read mode showing full body and 암송 시작 button', () => {
		render(VerseCard, { props: { verse } });
		expect(screen.getByText(verse.w)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('암송 시작 covers every word with a striped overlay', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		// 17 words in the canonical 잠언 3:5-6 verse text
		expect(container.querySelectorAll('.word')).toHaveLength(17);
		expect(getCoveredCount(container)).toBe(17);
	});

	it('전체 보기 reveals all words at once', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

		expect(getCoveredCount(container)).toBe(0);
		// 전체 보기 button is hidden once everything is revealed
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
	});

	it('처음부터 다시 re-covers all words', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
		await fireEvent.click(screen.getByRole('button', { name: '처음부터 다시' }));

		expect(getCoveredCount(container)).toBe(17);
	});

	it('암송 종료 returns to read mode with full body visible', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '암송 종료' }));

		expect(screen.getByText(verse.w)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('renders revealed words in document order via 전체 보기', async () => {
		const { container } = render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

		expect(getRevealedWordTexts(container)).toEqual([
			'너는',
			'마음을',
			'다하여',
			'여호와를',
			'의뢰하고',
			'네',
			'명철을',
			'의지하지',
			'말라',
			'너는',
			'범사에',
			'그를',
			'인정하라',
			'그리하면',
			'네',
			'길을',
			'지도하시리라'
		]);
	});

	it('single-word verse: 암송 시작 immediately uncovers the word', async () => {
		const { container } = render(VerseCard, { props: { verse: shortVerse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		expect(container.querySelectorAll('.word')).toHaveLength(1);
		expect(getCoveredCount(container)).toBe(0);
		// 전체 보기 button hidden because allRevealed is true
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
		// Other controls present
		expect(screen.getByRole('button', { name: '처음부터 다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 종료' })).toBeInTheDocument();
	});
});
```

Note on the fixture: 잠언 3:5-6 splits into 17 whitespace-delimited words. The test counts above (and the document-order list) reflect that.

- [ ] **Step 2: Run unit tests to verify failure**

Run: `corepack pnpm test VerseCard`
Expected: tests fail because the current VerseCard renders chunk-paragraphs and a cue button, not `.word` spans. Errors will mention missing `.word` elements or finding "탭해서 다음 부분 보기" buttons that the new tests don't expect.

- [ ] **Step 3: Replace VerseCard.svelte with the swipe-curtain implementation**

Replace the entire content of `src/lib/components/card/VerseCard.svelte` with:

```svelte
<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import { splitVerseWords } from '$lib/utils/chunk';
	import { goto } from '$app/navigation';

	interface Props {
		verse: StoredVerse;
		packageName?: string;
		packageId?: string;
		tags?: VerseTag[];
	}
	let { verse, packageName, packageId, tags = [] }: Props = $props();

	// ─── Memorize mode state ──────────────────────────────────────────────
	let mode: 'read' | 'memorize' = $state('read');
	let revealedCount = $state(0);
	let pxPerWord = $state(36); // overwritten on first measure
	let paragraphEl: HTMLParagraphElement | undefined = $state();

	const words = $derived(splitVerseWords(verse.w));
	const totalWords = $derived(words.length);
	const allRevealed = $derived(revealedCount >= totalWords);

	function enterMemorize() {
		mode = 'memorize';
		// Single-word verses: no curtain to drag, show immediately
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function resetReveal() {
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function revealAll() {
		revealedCount = totalWords;
	}
	function exitMemorize() {
		mode = 'read';
		revealedCount = 0;
	}

	// ─── Pointer-driven curtain drag ──────────────────────────────────────
	let dragBaseline = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragActive = false;
	let dragHorizontal = false;

	function onPointerDown(e: PointerEvent) {
		if (mode !== 'memorize' || totalWords <= 1) return;
		dragBaseline = revealedCount;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragActive = true;
		dragHorizontal = false;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragActive) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;

		// Direction lock: until decided, don't update count
		if (!dragHorizontal) {
			if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
				// Vertical-leaning gesture — release so the page can scroll
				dragActive = false;
				const target = e.currentTarget as Element;
				if (target.hasPointerCapture(e.pointerId)) {
					target.releasePointerCapture(e.pointerId);
				}
				return;
			}
			if (Math.abs(dx) < 4) return;
			dragHorizontal = true;
		}

		revealedCount = Math.max(
			0,
			Math.min(totalWords, dragBaseline + Math.round(dx / pxPerWord))
		);
	}

	function onPointerUp(e: PointerEvent) {
		dragActive = false;
		const target = e.currentTarget as Element;
		if (target.hasPointerCapture(e.pointerId)) {
			target.releasePointerCapture(e.pointerId);
		}
	}

	// Recompute pxPerWord on memorize entry + paragraph resizes
	$effect(() => {
		if (mode !== 'memorize' || !paragraphEl || totalWords === 0) return;
		const measure = () => {
			pxPerWord = paragraphEl!.getBoundingClientRect().width / totalWords;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(paragraphEl);
		return () => ro.disconnect();
	});

	// ─── Tag click navigation (existing) ──────────────────────────────────
	function tagHref(tag: VerseTag): string {
		if (!packageId) return '#';
		const params = new URLSearchParams();
		params.set('s', String(tag.seriesIndex));
		if (tag.level === 2) {
			params.set('g', String(tag.groupIndex));
		}
		return `/library/${packageId}?${params.toString()}`;
	}

	function onTagClick(tag: VerseTag) {
		goto(tagHref(tag));
	}
</script>

<article
	class="verse-card overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 pb-9 pt-7"
>
	<header class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<p
				class="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]"
			>
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

	{#if mode === 'read'}
		<p
			class="mt-6 whitespace-pre-line break-keep text-[17px] leading-[1.85] text-[var(--color-text)]"
		>
			{verse.w}
		</p>
	{:else}
		<p
			class="paragraph mt-6 break-keep text-[17px] leading-[2] text-[var(--color-text)] select-none touch-pan-y"
			bind:this={paragraphEl}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			{#each words as word, i (i)}<span
					class="word"
					class:covered={i >= revealedCount}
				>
					<span class="word-text">{word}</span>
				</span>{' '}{/each}
		</p>
		{#if !allRevealed}
			<p
				class="mt-3 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
			>
				→ 좌→우로 드래그해서 단어를 열어보세요
			</p>
		{/if}
	{/if}

	{#if tags.length > 0}
		<div class="mt-6 flex flex-wrap gap-1.5">
			{#each tags as tag (tag.level + ':' + tag.seriesIndex + ':' + ('groupIndex' in tag ? tag.groupIndex : -1))}
				<CategoryTag
					label={tag.group.group_name}
					level={tag.level}
					onclick={() => onTagClick(tag)}
				/>
			{/each}
		</div>
	{/if}

	<!-- Mode controls -->
	<div class="mt-6 flex items-center justify-end gap-3 text-[12px]">
		{#if mode === 'read'}
			<button
				type="button"
				onclick={enterMemorize}
				class="inline-flex items-center rounded-full bg-[var(--color-accent)] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
			>
				암송 시작
			</button>
		{:else}
			<button
				type="button"
				onclick={resetReveal}
				class="text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
			>
				처음부터 다시
			</button>
			{#if !allRevealed}
				<span class="text-[var(--color-text-tertiary)]" aria-hidden="true">·</span>
				<button
					type="button"
					onclick={revealAll}
					class="text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
				>
					전체 보기
				</button>
			{/if}
			<span class="text-[var(--color-text-tertiary)]" aria-hidden="true">·</span>
			<button
				type="button"
				onclick={exitMemorize}
				aria-label="암송 종료"
				class="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
			>
				✕
			</button>
		{/if}
	</div>
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}

	.word {
		display: inline-block;
		position: relative;
		padding: 0 2px;
	}
	.word-text {
		transition: opacity 150ms ease;
	}
	.word.covered .word-text {
		opacity: 0;
	}
	.word::after {
		content: '';
		position: absolute;
		inset: 8% 0;
		border-radius: 4px;
		background: repeating-linear-gradient(
			135deg,
			var(--color-border),
			var(--color-border) 4px,
			var(--color-accent-soft) 4px,
			var(--color-accent-soft) 8px
		);
		opacity: 0;
		transition: opacity 150ms ease;
		pointer-events: none;
	}
	.word.covered::after {
		opacity: 1;
	}
</style>
```

- [ ] **Step 4: Run unit tests to verify pass**

Run: `corepack pnpm test VerseCard`
Expected: 7 tests passing.

- [ ] **Step 5: Run full unit suite**

Run: `corepack pnpm check && corepack pnpm test`
Expected: 0 typecheck errors; full unit suite passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte tests/unit/VerseCard.test.ts
git commit -m "feat: replace tap-reveal with swipe-curtain memorize mode"
```

---

## Task 3: Rewrite e2e tests for the curtain drag

**Files:**
- Modify: `tests/e2e/memorize.spec.ts`

The previous e2e suite tested chunk-by-chunk taps. The new mode has no tap-cue — interaction is pointer drag. We replace tests that referenced "다음 부분 보기" / "구절을 떠올려보세요" cue with pointer-drag scenarios using Playwright's `page.mouse.*` API.

- [ ] **Step 1: Replace tests/e2e/memorize.spec.ts**

Replace the entire content of `tests/e2e/memorize.spec.ts` with:

```ts
import { test, expect, type Page } from '@playwright/test';

async function getParagraphBox(page: Page) {
	const handle = await page.locator('p.paragraph').elementHandle();
	if (!handle) throw new Error('paragraph not visible');
	const box = await handle.boundingBox();
	if (!box) throw new Error('paragraph has no bounding box');
	return box;
}

async function dragHorizontally(page: Page, fromXPct: number, toXPct: number) {
	const box = await getParagraphBox(page);
	const y = box.y + box.height / 2;
	const fromX = box.x + box.width * fromXPct;
	const toX = box.x + box.width * toXPct;
	await page.mouse.move(fromX, y);
	await page.mouse.down();
	// Move in small steps so direction-lock heuristic engages on a real path
	const steps = 12;
	for (let i = 1; i <= steps; i++) {
		const x = fromX + ((toX - fromX) * i) / steps;
		await page.mouse.move(x, y);
	}
	await page.mouse.up();
}

test.describe('swipe curtain memorize mode', () => {
	test('verse detail starts in read mode with body visible', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await expect(page.getByText('잠언 3 : 5-6')).toBeVisible();
		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
	});

	test('암송 시작 covers every word with a striped overlay', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// 17 words in 잠언 3:5-6, all covered initially
		await expect(page.locator('.word')).toHaveCount(17);
		await expect(page.locator('.word.covered')).toHaveCount(17);

		// Drag hint visible while not all revealed
		await expect(page.getByText(/드래그해서 단어를 열어보세요/)).toBeVisible();
	});

	test('horizontal drag reveals words in reading order', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// Drag from left edge to ~30% across the paragraph
		await dragHorizontally(page, 0.0, 0.3);

		const covered = await page.locator('.word.covered').count();
		const uncovered = await page.locator('.word:not(.covered)').count();
		expect(uncovered).toBeGreaterThan(0);
		expect(covered).toBeGreaterThan(0);
		expect(covered + uncovered).toBe(17);

		// First uncovered word should be the first word of the verse
		const firstWord = await page
			.locator('.word:not(.covered) .word-text')
			.first()
			.textContent();
		expect(firstWord?.trim()).toBe('너는');
	});

	test('drag accumulates across gestures', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		await dragHorizontally(page, 0.0, 0.2);
		const afterFirst = await page.locator('.word:not(.covered)').count();
		expect(afterFirst).toBeGreaterThan(0);

		await dragHorizontally(page, 0.0, 0.2);
		const afterSecond = await page.locator('.word:not(.covered)').count();
		expect(afterSecond).toBeGreaterThan(afterFirst);
	});

	test('전체 보기 reveals all words and removes itself', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();

		await expect(page.locator('.word.covered')).toHaveCount(0);
		await expect(page.getByRole('button', { name: '전체 보기' })).toHaveCount(0);
	});

	test('처음부터 다시 re-covers all words', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();
		await page.getByRole('button', { name: '처음부터 다시' }).click();

		await expect(page.locator('.word.covered')).toHaveCount(17);
	});

	test('암송 종료 returns to read mode', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '암송 종료' }).click();

		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
		// .word elements gone in read mode
		await expect(page.locator('.word')).toHaveCount(0);
	});
});
```

- [ ] **Step 2: Run new e2e tests**

Make sure the pnpm shim is in place; if not:
```bash
mkdir -p /tmp/pnpm-shim && printf '#!/bin/bash\nexec corepack pnpm "$@"\n' > /tmp/pnpm-shim/pnpm && chmod +x /tmp/pnpm-shim/pnpm
```

Then:
```bash
lsof -ti:4173 | xargs kill -9 2>/dev/null
PATH="/tmp/pnpm-shim:$PATH" corepack pnpm test:e2e memorize
```

Expected: 14 passing (7 tests × 2 browsers — chromium + iphone-14).

If any test fails (drag tests are the most likely flake source), debug:

- Check that the paragraph element is visible and laid out before measuring its bounding box
- Verify that the drag distance produces enough words: at 0.3 width drag, expect roughly 17 × 0.3 ≈ 5 words revealed
- The direction-lock heuristic requires `|dx| ≥ 4px` before counting — if the test drags too short, the count won't change

If the drag-to-30% test reveals too few words because the paragraph is narrow, increase the drag percentage in that test (e.g., 0.0 → 0.5).

- [ ] **Step 3: Run full e2e suite to confirm no regression**

```bash
PATH="/tmp/pnpm-shim:$PATH" corepack pnpm test:e2e
```

Expected: all e2e tests passing (existing 26 + 14 new = 40 total).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/memorize.spec.ts
git commit -m "test: rewrite memorize e2e for swipe-curtain drag interaction"
```

---

## Task 4: Push to production

**Files:** none

- [ ] **Step 1: Confirm clean local state**

Run: `git status`
Expected: nothing to commit; on `main`.

Run: `corepack pnpm check && corepack pnpm test`
Expected: 0 errors; all unit tests passing (full count).

- [ ] **Step 2: Push and watch CI**

```bash
git push
sleep 4 && gh run list --branch main --limit 1 -R essohn/memscripture
```

Wait until status is `completed success`. The CI runs both unit and e2e — both must pass.

If CI fails on e2e (drag flakiness on the headless GitHub runners), investigate the drag-test logs in the run artifacts. Common fixes:

- Increase the number of intermediate `mouse.move` steps in `dragHorizontally`
- Add a short `await page.waitForTimeout(100)` between `mouse.down()` and the first move event so the direction-lock heuristic has time to register

- [ ] **Step 3: Manual verification on phone**

Open `/library/60_krv/1` (or any verse with 4+ words):

- Body visible by default with "암송 시작" button at the bottom-right
- Tap "암송 시작" → all words become striped boxes; hint "→ 좌→우로 드래그해서 단어를 열어보세요" appears below
- Drag from left to right anywhere on the paragraph → words reveal in reading order
- Drag back leftward within the same gesture → words re-cover
- Lift finger and drag again → continues from current revealed count
- After all words revealed, hint disappears
- "처음부터 다시" → all boxes return
- "전체 보기" → all words shown at once
- "✕" → returns to read mode with full body
- Vertical scroll on the paragraph → page scrolls (drag does NOT trigger because of direction lock)
- Single-word verse (if available): "암송 시작" immediately shows the word
