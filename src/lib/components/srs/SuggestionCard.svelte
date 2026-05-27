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
			암송 시작
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
