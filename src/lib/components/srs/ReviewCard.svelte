<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import RatingButtons from './RatingButtons.svelte';

	interface Props {
		verse: StoredVerse;
		onCiteRated: (score: number) => void;
		onRecallRated: (score: number) => void;
	}
	let { verse, onCiteRated, onRecallRated }: Props = $props();

	type Stage = 1 | 2;
	let stage = $state<Stage>(1);
	let titleHintShown = $state(false);

	function rateCite(score: number) {
		onCiteRated(score);
		stage = 2;
	}

	function rateRecall(score: number) {
		onRecallRated(score);
	}
</script>

<article
	class="review-card mx-auto flex flex-col rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-10"
>
	<header class="flex flex-col items-center gap-3 text-center">
		<p class="text-[24px] font-semibold tabular-nums text-[var(--color-text)]">{verse.cite}</p>
		{#if titleHintShown}
			<p class="text-[16px] text-[var(--color-text-secondary)]">{verse.title}</p>
		{/if}
	</header>

	{#if stage === 1}
		{#if !titleHintShown}
			<div class="mt-6 flex justify-center">
				<button
					type="button"
					onclick={() => (titleHintShown = true)}
					class="text-[12px] font-medium text-[var(--color-text-tertiary)] underline-offset-4 hover:underline"
				>
					Title 힌트 보기
				</button>
			</div>
		{/if}
		<div class="mt-8">
			<RatingButtons phase="cite" onrate={rateCite} />
		</div>
	{:else}
		<p
			class="mt-8 whitespace-pre-line break-keep text-center text-[17px] leading-[1.85] text-[var(--color-text)]"
		>
			{verse.w}
		</p>
		<div class="mt-8">
			<RatingButtons phase="recall" onrate={rateRecall} />
		</div>
	{/if}
</article>

<style>
	.review-card {
		box-shadow: var(--shadow-card);
	}
</style>
