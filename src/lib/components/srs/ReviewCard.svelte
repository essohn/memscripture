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
