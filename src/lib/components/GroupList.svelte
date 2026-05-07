<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		packageId: string;
		verses: StoredVerse[];
	}
	let { packageId, verses }: Props = $props();
</script>

<ul
	class="group-list overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
>
	{#each verses as v, i (v.no)}
		<li class:border-t={i > 0} class="border-[var(--color-border)]">
			<a
				data-testid="verse-row"
				href={`/library/${packageId}/${v.no}`}
				class="verse-row group flex items-center gap-4 px-5 py-4"
			>
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[13px] font-semibold tabular-nums text-[var(--color-accent)] transition-colors group-hover:bg-[var(--color-accent)] group-hover:text-white"
				>
					{v.no}
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-[15px] font-medium text-[var(--color-text)]">{v.title}</p>
					<p class="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{v.cite}</p>
				</div>
				<ChevronRight
					size={18}
					class="shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
				/>
			</a>
		</li>
	{/each}
</ul>

<style>
	.group-list {
		box-shadow: var(--shadow-soft);
	}
	.verse-row {
		transition: background-color 180ms ease;
	}
	.verse-row:hover {
		background-color: var(--color-elevated);
	}
</style>
