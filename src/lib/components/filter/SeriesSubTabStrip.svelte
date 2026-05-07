<script lang="ts">
	import type { IndexGroup } from '$lib/types';

	interface Props {
		series: IndexGroup[];
		activeIndex: number | null;
		onSelect: (index: number | null) => void;
	}
	let { series, activeIndex, onSelect }: Props = $props();

	const allActive = $derived(activeIndex === null);
</script>

{#if series.length > 1}
	<div
		role="group"
		aria-label="시리즈 선택"
		class="-mx-5 flex gap-1.5 overflow-x-auto px-5 py-2"
		style="overscroll-behavior-x: contain;"
	>
		<button
			type="button"
			aria-pressed={allActive}
			class="shrink-0 rounded-full border px-2.5 py-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors"
			class:bg-[var(--color-text)]={allActive}
			class:text-white={allActive}
			class:border-[var(--color-text)]={allActive}
			class:bg-[var(--color-card)]={!allActive}
			class:text-[var(--color-text-secondary)]={!allActive}
			class:border-[var(--color-border)]={!allActive}
			onclick={() => onSelect(null)}
		>
			전체
		</button>
		{#each series as s, i (s.group_name)}
			<button
				type="button"
				aria-pressed={activeIndex === i}
				class="shrink-0 rounded-full border px-2.5 py-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors"
				class:bg-[var(--color-text)]={activeIndex === i}
				class:text-white={activeIndex === i}
				class:border-[var(--color-text)]={activeIndex === i}
				class:bg-[var(--color-card)]={activeIndex !== i}
				class:text-[var(--color-text-secondary)]={activeIndex !== i}
				class:border-[var(--color-border)]={activeIndex !== i}
				onclick={() => onSelect(i)}
			>
				{s.group_name}
			</button>
		{/each}
	</div>
{/if}
