<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';

	interface Props {
		packageId: string;
		verses: StoredVerse[];
	}
	let { packageId, verses }: Props = $props();
</script>

<ul
	class="divide-y divide-[var(--color-border)] bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden"
>
	{#each verses as v (v.no)}
		<li>
			<a
				data-testid="verse-row"
				href={`/library/${packageId}/${v.no}`}
				class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-elevated)]"
			>
				<div class="min-w-0">
					<p class="text-sm font-medium text-[var(--color-text)] truncate">{v.title}</p>
					<p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">{v.cite}</p>
				</div>
				<span class="text-xs text-[var(--color-text-tertiary)]">{v.no}</span>
			</a>
		</li>
	{/each}
</ul>
