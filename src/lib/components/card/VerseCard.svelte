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
