# Progressive Reveal Memorization Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-card "암송 모드" to `VerseCard` that hides the verse body and progressively reveals clause-sized chunks on tap.

**Architecture:** A pure helper (`splitVerseText`) handles clause-based chunking with a length-based fallback. `VerseCard` owns local mode state (`'read' | 'memorize'`) and `revealedCount`. Read mode is the default; "암송 시작" toggles to memorize mode where a tap-cue reveals one chunk per click. Three controls (`처음부터 다시`, `전체 보기`, `암송 종료`) manage the session.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes) / TypeScript / Tailwind v4 / Vitest / @testing-library/svelte / Playwright

**Spec:** [docs/superpowers/specs/2026-05-08-progressive-reveal-memorization-mode-design.md](../specs/2026-05-08-progressive-reveal-memorization-mode-design.md)

---

## File Structure

```
src/lib/utils/chunk.ts                NEW   — splitVerseText() pure function
tests/unit/chunk.test.ts              NEW   — TDD tests for chunking
src/lib/components/card/VerseCard.svelte   EDIT  — mode state, controls, conditional render
tests/unit/VerseCard.test.ts          NEW   — mode transition tests
tests/e2e/memorize.spec.ts            NEW   — full memorize flow
```

---

## Task 1: Chunking helper (TDD)

**Files:**
- Create: `src/lib/utils/chunk.ts`
- Create: `tests/unit/chunk.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/chunk.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitVerseText } from '../../src/lib/utils/chunk';

describe('splitVerseText', () => {
	it('returns [] for empty input', () => {
		expect(splitVerseText('')).toEqual([]);
	});

	it('returns [] for whitespace-only input', () => {
		expect(splitVerseText('   \n  ')).toEqual([]);
	});

	it('splits the canonical 잠언 3:5-6 into 4 clauses', () => {
		const text =
			'너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라';
		expect(splitVerseText(text)).toEqual([
			'너는 마음을 다하여 여호와를 의뢰하고',
			'네 명철을 의지하지 말라',
			'너는 범사에 그를 인정하라',
			'그리하면 네 길을 지도하시리라'
		]);
	});

	it('returns one chunk when text has no terminal endings', () => {
		expect(splitVerseText('짧은 한 문장')).toEqual(['짧은 한 문장']);
	});

	it('returns one chunk when only one clause-ending split would occur', () => {
		// Single split point would yield 2 short chunks, but if either chunk's primary
		// split is the only one, accept it.
		expect(splitVerseText('첫 부분이라 둘째 부분이다')).toEqual([
			'첫 부분이라',
			'둘째 부분이다'
		]);
	});

	it('falls back to length-based when primary yields too few chunks', () => {
		// No clause endings; primary returns 1 chunk; if too long, fallback splits
		const longNoEndings =
			'단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어 단어';
		const result = splitVerseText(longNoEndings, 20);
		expect(result.length).toBeGreaterThan(1);
		expect(result.every((c) => c.length <= 20)).toBe(true);
	});

	it('falls back when a primary chunk exceeds maxChunkChars', () => {
		// One clause is much longer than the limit — fallback grouping
		const text =
			'아주아주아주아주아주아주아주아주아주아주아주아주긴 단어 묶음이라 짧은 마무리';
		const result = splitVerseText(text, 15);
		expect(result.every((c) => c.length <= 15)).toBe(true);
	});

	it('preserves all the original tokens (lossless join)', () => {
		const text =
			'너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라';
		const chunks = splitVerseText(text);
		const joined = chunks.join(' ').replace(/\s+/g, ' ').trim();
		const original = text.replace(/\s+/g, ' ').trim();
		expect(joined).toBe(original);
	});

	it('handles trailing/leading whitespace by trimming', () => {
		expect(splitVerseText('  hello world  ')).toEqual(['hello world']);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm test chunk`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement splitVerseText**

Create `src/lib/utils/chunk.ts`:

```ts
/**
 * Split a Korean Bible verse body into recall chunks for memorization.
 *
 * Primary strategy: split at Korean clause endings (-다, -라, -고, -며, -니)
 * followed by whitespace. This is lossless — joining chunks with a single
 * space reconstructs the original (modulo whitespace normalization).
 *
 * Fallback: if the primary split yields fewer than 2 chunks OR any chunk
 * exceeds `maxChunkChars`, fall back to length-based grouping at whitespace
 * boundaries.
 */
export function splitVerseText(text: string, maxChunkChars = 40): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	// Primary: split at clause endings + whitespace
	const primary = trimmed
		.split(/(?<=[다라고며니])\s+/g)
		.map((p) => p.trim())
		.filter(Boolean);

	if (primary.length >= 2 && primary.every((p) => p.length <= maxChunkChars)) {
		return primary;
	}

	// Fallback: length-based grouping at word boundaries
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	if (words.length === 1) return [words[0]];

	const chunks: string[] = [];
	let current = '';
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > maxChunkChars && current) {
			chunks.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) chunks.push(current);
	return chunks.length > 0 ? chunks : [trimmed];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `corepack pnpm test chunk`
Expected: 9 passing.

- [ ] **Step 5: Run full check**

Run: `corepack pnpm check && corepack pnpm test`
Expected: 0 typecheck errors; full unit suite (44 + 9 = 53) passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/chunk.ts tests/unit/chunk.test.ts
git commit -m "feat: add splitVerseText for memorization chunk reveal"
```

---

## Task 2: Add memorize mode to VerseCard

**Files:**
- Modify: `src/lib/components/card/VerseCard.svelte`
- Create: `tests/unit/VerseCard.test.ts`

This task is bigger because state, markup, and controls all need to land together to produce a working component. The component test suite drives the change.

- [ ] **Step 1: Write failing component tests**

Create `tests/unit/VerseCard.test.ts`:

```ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VerseCard from '../../src/lib/components/card/VerseCard.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

// 4-chunk verse: ["a다", "b라", "c고", "d라"]
const verse: StoredVerse = {
	package_id: 'p',
	no: 1,
	i: 1,
	title: '제목',
	cite: '잠언 3:5-6',
	w: 'a다 b라 c고 d라'
};

const shortVerse: StoredVerse = {
	...verse,
	w: '짧은 한 문장'
};

describe('VerseCard memorize mode', () => {
	it('starts in read mode showing full body and 암송 시작 button', () => {
		render(VerseCard, { props: { verse } });
		expect(screen.getByText('a다 b라 c고 d라')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('암송 시작 hides the body and shows the cue', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		expect(screen.queryByText('a다 b라 c고 d라')).toBeNull();
		expect(screen.getByText(/구절을 떠올려보세요/)).toBeInTheDocument();
	});

	it('tapping the cue reveals chunks one by one', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		await fireEvent.click(screen.getByRole('button', { name: /구절을 떠올려보세요/ }));
		expect(screen.getByText('a다')).toBeInTheDocument();
		expect(screen.queryByText('b라')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /다음 부분 보기/ }));
		expect(screen.getByText('b라')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /다음 부분 보기/ }));
		expect(screen.getByText('c고')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /다음 부분 보기/ }));
		expect(screen.getByText('d라')).toBeInTheDocument();

		// All revealed: no more cue
		expect(screen.queryByRole('button', { name: /다음 부분 보기/ })).toBeNull();
	});

	it('전체 보기 reveals all chunks at once and removes itself', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

		expect(screen.getByText('a다')).toBeInTheDocument();
		expect(screen.getByText('b라')).toBeInTheDocument();
		expect(screen.getByText('c고')).toBeInTheDocument();
		expect(screen.getByText('d라')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
		expect(screen.queryByRole('button', { name: /구절을 떠올려보세요/ })).toBeNull();
	});

	it('처음부터 다시 resets revealed count and brings the cue back', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
		await fireEvent.click(screen.getByRole('button', { name: '처음부터 다시' }));

		expect(screen.queryByText('a다')).toBeNull();
		expect(screen.getByText(/구절을 떠올려보세요/)).toBeInTheDocument();
	});

	it('암송 종료 returns to read mode with full body visible', async () => {
		render(VerseCard, { props: { verse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));
		await fireEvent.click(screen.getByRole('button', { name: '암송 종료' }));

		expect(screen.getByText('a다 b라 c고 d라')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 시작' })).toBeInTheDocument();
	});

	it('single-chunk verse skips cue: enters memorize mode with text already revealed', async () => {
		render(VerseCard, { props: { verse: shortVerse } });
		await fireEvent.click(screen.getByRole('button', { name: '암송 시작' }));

		// Body shown as a single chunk paragraph
		expect(screen.getByText('짧은 한 문장')).toBeInTheDocument();
		// No cue button
		expect(screen.queryByRole('button', { name: /구절을 떠올려보세요/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /다음 부분 보기/ })).toBeNull();
		// 전체 보기 hidden because all already revealed
		expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
		// Other controls still present
		expect(screen.getByRole('button', { name: '처음부터 다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '암송 종료' })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm test VerseCard`
Expected: FAIL — buttons "암송 시작", "전체 보기", "처음부터 다시", "암송 종료" not found.

- [ ] **Step 3: Replace VerseCard.svelte with memorize mode logic + UI**

Replace `src/lib/components/card/VerseCard.svelte` with:

```svelte
<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import { splitVerseText } from '$lib/utils/chunk';
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

	const chunks = $derived(splitVerseText(verse.w));
	const allRevealed = $derived(revealedCount >= chunks.length);
	const visibleChunks = $derived(chunks.slice(0, revealedCount));

	function enterMemorize() {
		mode = 'memorize';
		// Single-chunk verses: nothing to reveal progressively, show the chunk immediately
		revealedCount = chunks.length <= 1 ? chunks.length : 0;
	}
	function revealNext() {
		revealedCount = Math.min(chunks.length, revealedCount + 1);
	}
	function resetReveal() {
		revealedCount = chunks.length <= 1 ? chunks.length : 0;
	}
	function revealAll() {
		revealedCount = chunks.length;
	}
	function exitMemorize() {
		mode = 'read';
		revealedCount = 0;
	}

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
		<div class="mt-6 space-y-2">
			{#each visibleChunks as chunk, i (i)}
				<p class="break-keep text-[17px] leading-[1.85] text-[var(--color-text)]">
					{chunk}
				</p>
			{/each}
			{#if !allRevealed}
				<button
					type="button"
					onclick={revealNext}
					class="mt-3 flex w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-4 py-5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent-soft)_70%,white)]"
				>
					{revealedCount === 0
						? '구절을 떠올려보세요. 탭하면 첫 부분이 보여요.'
						: '탭해서 다음 부분 보기 →'}
				</button>
			{/if}
		</div>
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
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `corepack pnpm test VerseCard`
Expected: 7 passing.

- [ ] **Step 5: Run full check (typecheck + all unit tests)**

Run: `corepack pnpm check && corepack pnpm test`
Expected: 0 typecheck errors; full unit suite (53 + 7 = 60) passing.

- [ ] **Step 6: Run existing E2E to verify the verse-detail flow still works**

Make sure the pnpm shim is in place; if not:

```bash
mkdir -p /tmp/pnpm-shim && printf '#!/bin/bash\nexec corepack pnpm "$@"\n' > /tmp/pnpm-shim/pnpm && chmod +x /tmp/pnpm-shim/pnpm
```

Run:

```bash
lsof -ti:4173 | xargs kill -9 2>/dev/null
PATH="/tmp/pnpm-shim:$PATH" corepack pnpm test:e2e -g "verse detail"
```

Expected: existing test "verse detail shows the verse text" passes (since read mode is default, the body text is still visible on initial load).

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/card/VerseCard.svelte tests/unit/VerseCard.test.ts
git commit -m "feat: add progressive-reveal memorize mode to VerseCard"
```

---

## Task 3: E2E coverage for memorize flow

**Files:**
- Create: `tests/e2e/memorize.spec.ts`

- [ ] **Step 1: Write E2E tests**

Create `tests/e2e/memorize.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('memorize mode', () => {
	test('verse detail starts in read mode with body visible', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await expect(page.getByText('잠언 3 : 5-6')).toBeVisible();
		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
	});

	test('암송 시작 hides body and shows the cue', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// Cue is visible
		await expect(page.getByText(/구절을 떠올려보세요/)).toBeVisible();
		// Body text not visible as a single block — at least the first chunk's
		// surrounding context shouldn't be on screen yet
		await expect(page.getByText(/그리하면 네 길을 지도하시리라/)).not.toBeVisible();
	});

	test('tapping cue reveals chunks progressively', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();

		// First tap reveals chunk 1
		await page.getByRole('button', { name: /구절을 떠올려보세요/ }).click();
		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();

		// Last chunk not yet revealed
		await expect(page.getByText('그리하면 네 길을 지도하시리라')).not.toBeVisible();

		// Tap until done
		const next = page.getByRole('button', { name: /다음 부분 보기/ });
		await next.click();
		await next.click();
		await next.click();

		await expect(page.getByText('그리하면 네 길을 지도하시리라')).toBeVisible();
		// Cue gone
		await expect(page.getByRole('button', { name: /다음 부분 보기/ })).toHaveCount(0);
	});

	test('전체 보기 reveals all chunks immediately', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();

		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByText('그리하면 네 길을 지도하시리라')).toBeVisible();
		// 전체 보기 disappears once everything is revealed
		await expect(page.getByRole('button', { name: '전체 보기' })).toHaveCount(0);
	});

	test('처음부터 다시 resets reveal', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '전체 보기' }).click();
		await page.getByRole('button', { name: '처음부터 다시' }).click();

		await expect(page.getByText('그리하면 네 길을 지도하시리라')).not.toBeVisible();
		await expect(page.getByText(/구절을 떠올려보세요/)).toBeVisible();
	});

	test('암송 종료 returns to read mode', async ({ page }) => {
		await page.goto('/library/5_krv/5');
		await page.getByRole('button', { name: '암송 시작' }).click();
		await page.getByRole('button', { name: '암송 종료' }).click();

		await expect(page.getByText('너는 마음을 다하여 여호와를 의뢰하고')).toBeVisible();
		await expect(page.getByRole('button', { name: '암송 시작' })).toBeVisible();
	});
});
```

- [ ] **Step 2: Run new E2E tests**

```bash
lsof -ti:4173 | xargs kill -9 2>/dev/null
PATH="/tmp/pnpm-shim:$PATH" corepack pnpm test:e2e memorize
```

Expected: 12 passing (6 tests × 2 browsers — chromium + iphone-14).

- [ ] **Step 3: Run full E2E suite to confirm no regression**

```bash
PATH="/tmp/pnpm-shim:$PATH" corepack pnpm test:e2e
```

Expected: all e2e tests passing (existing 26 + new 12 = 38 total).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/memorize.spec.ts
git commit -m "test: e2e coverage for progressive-reveal memorize mode"
```

---

## Task 4: Push to production

**Files:** none

- [ ] **Step 1: Confirm clean local state**

Run: `git status`
Expected: nothing to commit; on `main`.

Run: `corepack pnpm check && corepack pnpm test`
Expected: 0 errors; all unit tests passing.

- [ ] **Step 2: Push and watch CI**

```bash
git push
sleep 4 && gh run list --branch main --limit 1 -R essohn/memscripture
```

Wait until status is `completed success`. The full e2e step in CI will validate browser behavior.

- [ ] **Step 3: Manual verification on phone**

Open the phone-accessible dev URL (or production once Cloudflare Pages is connected). On `/library/60_krv/1`:

- Body visible by default with "암송 시작" button at the bottom-right
- Tap "암송 시작" → body collapses, cue area appears
- Tap the cue → first chunk appears
- Continue tapping → all chunks revealed in order
- "처음부터 다시" → all chunks vanish, cue returns
- "전체 보기" → all chunks shown at once
- "✕" → returns to read mode with full body
- Navigating away and back → state resets to read mode
