<script lang="ts">
	interface Props {
		onrate: (score: number) => void;
	}
	let { onrate }: Props = $props();

	const ratings: Array<{ score: number; label: string; tone: string }> = [
		{ score: 1, label: '다시', tone: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' },
		{ score: 2, label: '어렵', tone: 'bg-[var(--color-elevated)] text-[var(--color-text)]' },
		{ score: 3, label: '좋음', tone: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' },
		{ score: 4, label: '쉬움', tone: 'bg-[var(--color-accent)] text-white' }
	];
</script>

<div role="group" class="grid grid-cols-4 gap-2">
	{#each ratings as r (r.score)}
		<button
			type="button"
			onclick={() => onrate(r.score)}
			class="rounded-xl py-3 text-[14px] font-medium transition-opacity hover:opacity-90 {r.tone}"
		>
			{r.label}
		</button>
	{/each}
</div>
