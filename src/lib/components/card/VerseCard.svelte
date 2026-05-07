<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	interface Props {
		verse: StoredVerse;
		packageName?: string;
	}
	let { verse, packageName }: Props = $props();
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
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}
</style>
