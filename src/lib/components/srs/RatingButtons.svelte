<script lang="ts">
	interface Props {
		phase: 'cite' | 'recall';
		onrate: (score: number) => void;
	}
	let { phase, onrate }: Props = $props();

	const citeRatings = [
		{ score: 1, label: '떠오르지 않음', tone: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' },
		{ score: 2, label: '느리게 떠오름', tone: 'bg-[var(--color-elevated)] text-[var(--color-text)]' },
		{ score: 3, label: '적절히 떠오름', tone: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' },
		{ score: 4, label: '빨리 떠오름', tone: 'bg-[var(--color-accent)] text-white' }
	] as const;

	const recallRatings = [
		{ score: 1, label: '많이 틀림', tone: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' },
		{ score: 2, label: '조금 틀림', tone: 'bg-[var(--color-elevated)] text-[var(--color-text)]' },
		{ score: 3, label: '맞지만 불안함', tone: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' },
		{ score: 4, label: '완벽히 일치함', tone: 'bg-[var(--color-accent)] text-white' }
	] as const;

	const ratings = $derived(phase === 'cite' ? citeRatings : recallRatings);
	const prompt = $derived(
		phase === 'cite'
			? '시작 부분을 떠올리는데 느꼈던 난이도'
			: '암송 구절 전체가 일치했던 정도'
	);
</script>

<div>
	<p class="mb-3 text-center text-[13px] text-[var(--color-text-secondary)]">{prompt}</p>
	<div role="group" class="grid grid-cols-4 gap-2">
		{#each ratings as r (r.score)}
			<button
				type="button"
				onclick={() => onrate(r.score)}
				class="break-keep rounded-xl px-2 py-3 text-[13px] font-medium leading-tight transition-opacity hover:opacity-90 {r.tone}"
			>
				{r.label}
			</button>
		{/each}
	</div>
</div>
