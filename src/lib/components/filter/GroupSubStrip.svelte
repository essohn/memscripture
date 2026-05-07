<script lang="ts">
	import type { IndexGroup } from '$lib/types';

	interface Props {
		groups: IndexGroup[];
		activeIndices: number[];
		onToggle: (index: number) => void;
	}
	let { groups, activeIndices, onToggle }: Props = $props();
</script>

{#if groups.length > 0}
	<div
		class="-mx-5 flex items-center gap-1.5 overflow-x-auto px-5 pb-3"
		style="overscroll-behavior-x: contain;"
	>
		<span
			class="shrink-0 text-[9.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
		>
			SUB
		</span>
		{#each groups as g, i (g.group_name)}
			{@const active = activeIndices.includes(i)}
			<button
				type="button"
				aria-pressed={active}
				class="shrink-0 rounded-full border px-2.5 py-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors"
				class:bg-[var(--color-text-secondary)]={active}
				class:text-white={active}
				class:border-[var(--color-text-secondary)]={active}
				class:bg-[var(--color-card)]={!active}
				class:text-[var(--color-text-secondary)]={!active}
				class:border-[var(--color-border)]={!active}
				onclick={() => onToggle(i)}
			>
				{g.group_name}
			</button>
		{/each}
	</div>
{/if}
