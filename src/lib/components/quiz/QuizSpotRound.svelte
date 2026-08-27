<script lang="ts">
	import { tick } from 'svelte';
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

	/** The 다음 button, once the answer is in. */
	let nextButton = $state<HTMLButtonElement | undefined>();

	function choose(a: number | null) {
		if (answered) return;
		answer = a;
		// Answering takes role and tabindex off every word, so whatever the
		// reader was standing on stops being focusable and the browser drops
		// focus to <body> — from there a keyboard reader has to tab in from the
		// top of the page to reach the only control left. Hand it over instead.
		tick().then(() => nextButton?.focus());
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
		{#each words as word, i (i)}<!-- role/tabindex are applied dynamically
			(button only before the reader has answered); the static a11y check
			can't see that, so the noninteractive-tabindex rule is a false
			positive here. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex --><span
			class="word"
			class:tappable={!answered}
			class:wrong={answered && wrong.includes(i)}
			class:picked={answer === i}
			role={!answered ? 'button' : undefined}
			tabindex={!answered ? 0 : undefined}
			onclick={!answered ? () => choose(i) : undefined}
			onkeydown={!answered
				? (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							choose(i);
						}
					}
				: undefined}>{word}</span
		>{' '}{/each}
	</p>

	{#if !answered}
		<!-- The words are the other half of the answer, and nothing said so. They
		     carry role="button" and a hover tint; neither exists on a touch
		     screen, so a reader arriving cold saw a verse and one button reading
		     이상 없음 — and the only verdict they could express was that nothing
		     was wrong. VerseCard's marking mode has the same invisible-target
		     problem and answers it with a hint line rather than a per-word
		     marker; dotted styling already means "자주 틀린 곳" elsewhere in the
		     app, so borrowing it here would say something else. -->
		<p class="mt-3 text-[11px] text-[var(--color-text-tertiary)]">틀린 단어를 누르세요</p>
	{/if}

	{#if answered}
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{correct ? '맞았습니다' : '다시 볼 구절'}
		</p>
		<button
			bind:this={nextButton}
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
