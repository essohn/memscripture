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
	let pxPerWord = 36; // overwritten on first measure (plain let — only read in event handlers)
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
		<p
			class="mt-3 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
			aria-hidden={allRevealed}
		>
			{#if allRevealed}&nbsp;{:else}→ 좌→우로 드래그해서 단어를 열어보세요{/if}
		</p>
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
		inset: 2px 0;
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
