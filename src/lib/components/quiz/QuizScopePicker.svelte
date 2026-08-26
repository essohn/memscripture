<script lang="ts">
	import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '$lib/db/verseRatings';
	import { buildQueue, type ItemRating, type QuizItem, type Tier } from '$lib/quiz/session';
	import type { Target } from '$lib/quiz/scope';

	interface Props {
		targets: Target[];
		selected: Target | null;
		/** Everything the selected 대상 resolves to, before the tier filter. */
		items: QuizItem[];
		ratings: Map<string, ItemRating>;
		onPick: (t: Target) => void;
		onStart: (queue: QuizItem[]) => void;
	}
	let { targets, selected, items, ratings, onPick, onStart }: Props = $props();

	/** Every chip on to begin with: the reader opened this to quiz a scope,
	 *  not to narrow one. null is 미평가. */
	let tiers = $state<Set<Tier>>(new Set<Tier>([...DIFFICULTY_LEVELS, null]));

	const queue = $derived(buildQueue(items, tiers, ratings));

	function toggle(t: Tier) {
		const next = new Set(tiers);
		if (next.has(t)) next.delete(t);
		else next.add(t);
		tiers = next;
	}
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">범위</h2>
		<div class="mt-2 flex flex-col gap-1.5">
			{#each targets as t (t.kind + t.id)}
				<button
					type="button"
					onclick={() => onPick(t)}
					aria-pressed={selected?.kind === t.kind && selected?.id === t.id}
					class="rounded-xl px-3 py-2 text-left text-[14px] {selected?.kind === t.kind &&
					selected?.id === t.id
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text)]'}"
				>
					{t.label}
				</button>
			{/each}
		</div>
	</div>

	<div>
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">난이도</h2>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each DIFFICULTY_LEVELS as level (level)}
				<button
					type="button"
					onclick={() => toggle(level)}
					aria-pressed={tiers.has(level)}
					class="rounded-full px-2.5 py-1 text-[12px] {tiers.has(level)
						? 'bg-[var(--color-accent)] text-white'
						: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
				>
					{DIFFICULTY_LABELS[level]}
				</button>
			{/each}
			<button
				type="button"
				onclick={() => toggle(null)}
				aria-pressed={tiers.has(null)}
				class="rounded-full px-2.5 py-1 text-[12px] {tiers.has(null)
					? 'bg-[var(--color-accent)] text-white'
					: 'bg-[var(--color-elevated)] text-[var(--color-text-secondary)]'}"
			>
				미평가
			</button>
		</div>
	</div>

	<div class="flex items-center justify-between gap-3">
		<!-- The count is the whole guard against an unreasonable session: a
		     900-verse package is not a quiz, and a reader who sees the number
		     will narrow it. Capping would silently drop verses they chose. -->
		<span class="text-[13px] text-[var(--color-text-secondary)]">{queue.length}구절</span>
		<button
			type="button"
			onclick={() => onStart(queue)}
			disabled={queue.length === 0}
			class="rounded-xl bg-[var(--color-accent)] px-5 py-2 font-medium text-white disabled:opacity-40"
		>
			시작
		</button>
	</div>
	{#if queue.length === 0}
		<p class="text-[12px] text-[var(--color-text-tertiary)]">고른 범위에 구절이 없습니다</p>
	{/if}
</section>
