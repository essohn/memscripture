<script lang="ts">
	import { comboMultiplier } from '$lib/arcade/combo';

	interface Props {
		/** The chain the session is carrying. Nothing is drawn at zero. */
		streak: number;
	}
	let { streak }: Props = $props();

	const multiplier = $derived(comboMultiplier(streak));
</script>

<!-- Shown by every game, because the chain spans all of them. A chain the
     reader only learns about on the summary is not a chain they can play
     for. -->
{#if streak > 0}
	<span
		data-testid="combo-readout"
		class="rounded-md border-2 border-[var(--color-accent)] px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-[var(--color-accent)] tabular-nums"
	>
		{streak} COMBO ×{multiplier}
	</span>
{/if}
