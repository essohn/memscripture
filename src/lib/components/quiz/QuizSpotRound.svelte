<script lang="ts">
	import { markMismatchedWords } from '$lib/memorize/grade';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';

	interface Props {
		item: QuizItem;
		/** The text to show: a recorded attempt, or the verse itself when the
		 *  reader has none for it. */
		shown: string;
		index: number;
		total: number;
		onDone: (result: RoundResult) => void;
	}
	let { item, shown, index, total, onDone }: Props = $props();

	/** The reader's answer: a word index, or null for 이상 없음. Undefined
	 *  while they are still deciding. */
	let answer = $state<number | null | undefined>(undefined);
	let reported = $state(false);

	const startedAt = Date.now();

	const words = $derived(shown.trim().split(/\s+/).filter(Boolean));

	/** Which words of the shown text do not belong. Recomputed rather than
	 *  stored: a second copy of a fact can disagree with the first, and the
	 *  verse is right here to compare against. */
	const wrong = $derived(
		markMismatchedWords(shown, item.w).flatMap((m, i) => (m.ok ? [] : [i]))
	);

	const answered = $derived(answer !== undefined);
	const correct = $derived(answer === null ? wrong.length === 0 : wrong.includes(answer as number));

	function choose(a: number | null) {
		if (answered) return;
		answer = a;
	}

	function next() {
		if (!answered || reported) return;
		reported = true;
		onDone({
			id: item.id,
			passed: correct,
			// A verdict, not a measurement: 1 means "found it", not "recited
			// it". Nothing counts quiz-spot as recall.
			accuracy: correct ? 1 : 0,
			missed: [],
			elapsedMs: Date.now() - startedAt
		});
	}
</script>

<div class="rounded-2xl bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
	<div class="flex items-baseline justify-between">
		<h2 class="text-[calc(16px*var(--vfs))] font-semibold text-[var(--color-text)]">
			{item.title}
		</h2>
		<span class="text-[11px] text-[var(--color-text-tertiary)]">{index + 1} / {total}</span>
	</div>
	<p class="mt-0.5 text-[calc(14px*var(--vfs))] text-[var(--color-text-secondary)]">{item.cite}</p>

	<p class="mt-3 text-[calc(16px*var(--vfs))] leading-[1.9] break-keep">
		{#each words as word, i (i)}<span
			class="word"
			class:tappable={!answered}
			class:wrong={answered && wrong.includes(i)}
			class:picked={answer === i}
			role={answered ? undefined : 'button'}
			tabindex={answered ? undefined : 0}
			onclick={answered ? undefined : () => choose(i)}
			onkeydown={answered
				? undefined
				: (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							choose(i);
						}
					}}>{word}</span
		>{' '}{/each}
	</p>

	{#if answered}
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{correct ? '맞았습니다' : '다시 볼 구절'}
		</p>
		<button
			type="button"
			onclick={next}
			class="mt-2 w-full rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다음
		</button>
	{:else}
		<button
			type="button"
			onclick={() => choose(null)}
			class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			이상 없음
		</button>
	{/if}
</div>

<style>
	/* Before the answer every word is a target; the cursor and a hover tint
	   are the cue, as in the card's marking mode. */
	.tappable {
		cursor: pointer;
		border-radius: 4px;
	}
	.tappable:hover {
		background-color: var(--color-accent-soft);
	}
	/* What the reader picked, right or not. */
	.picked {
		background-color: var(--color-accent-soft);
		border-radius: 4px;
	}
	/* The word that actually does not belong. Red rather than the accent:
	   this is the result of a test, not a note the reader left themselves. */
	.wrong {
		color: var(--color-danger);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
</style>
