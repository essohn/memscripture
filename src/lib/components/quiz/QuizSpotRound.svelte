<script lang="ts">
	import { tick } from 'svelte';
	import { markMismatchedWords } from '$lib/memorize/grade';
	import { findSpotFlaws } from '$lib/quiz/spot';
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

	/**
	 * The reader's verdict.
	 *
	 * Three shapes rather than "a word index or null", because a sentence can
	 * be wrong in a way that has nothing on screen to point at. 'flawed' is
	 * what the reader presses then — 이상 있음 — and undefined is still
	 * deciding.
	 */
	type Answer = { kind: 'word'; index: number } | { kind: 'flawed' } | { kind: 'clean' };
	let answer = $state<Answer | undefined>(undefined);
	let reported = $state(false);

	const startedAt = Date.now();

	const words = $derived(shown.trim().split(/\s+/).filter(Boolean));

	/** How the sentence differs from the verse, both ways. Recomputed rather
	 *  than stored: a second copy of a fact can disagree with the first, and
	 *  the verse is right here to compare against. */
	const flaws = $derived(findSpotFlaws(shown, item.w));

	/** The verse's own words, marked with the ones the sentence dropped. Shown
	 *  only when the sentence has nothing to underline — underlining teaches
	 *  the reader where the mistake was, and an omission has no there. */
	const verseWords = $derived(markMismatchedWords(item.w, shown));
	const showDropped = $derived(flaws.wrong.length === 0 && flaws.flawed);

	const answered = $derived(answer !== undefined);
	const correct = $derived(
		answer === undefined
			? false
			: answer.kind === 'clean'
				? !flaws.flawed
				: answer.kind === 'flawed'
					? flaws.flawed
					: flaws.wrong.includes(answer.index)
	);

	/** The 다음 button, once the answer is in. */
	let nextButton = $state<HTMLButtonElement | undefined>();

	function choose(a: Answer) {
		if (answered) return;
		answer = a;
		// Answering takes role and tabindex off every word, and removes the
		// button that was just pressed, so whatever the reader was standing on
		// stops being focusable and the browser drops focus to <body> — from
		// there a keyboard reader has to tab in from the top of the page to
		// reach the only control left. Hand it over instead.
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
			class:wrong={answered && flaws.wrong.includes(i)}
			class:picked={answer?.kind === 'word' && answer.index === i}
			role={!answered ? 'button' : undefined}
			tabindex={!answered ? 0 : undefined}
			onclick={!answered ? () => choose({ kind: 'word', index: i }) : undefined}
			onkeydown={!answered
				? (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							choose({ kind: 'word', index: i });
						}
					}
				: undefined}>{word}</span
		>{' '}{/each}
	</p>

	{#if !answered}
		<!-- The words are one half of the answer and nothing said so: they carry
		     role="button" and a hover tint, neither of which exists on a touch
		     screen. The second sentence is the other half — a dropped word has
		     nothing on screen to press, so the reader needs telling that 이상
		     있음 is how to say it. -->
		<p class="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
			틀린 단어를 누르세요. 빠진 단어가 있으면 이상 있음.
		</p>
	{/if}

	{#if answered}
		{#if showDropped}
			<!-- Nothing on screen was wrong, so nothing on screen can be marked.
			     What the reader has to see is the sentence they should have
			     written, with the dropped words called out in it. -->
			<p class="mt-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
				빠진 단어
			</p>
			<p
				data-testid="dropped-words"
				class="mt-1 text-[calc(15px*var(--vfs))] leading-[1.8] break-keep"
			>
				{#each verseWords as m, i (i)}<span
						class={m.ok
							? 'text-[var(--color-text-secondary)]'
							: 'rounded bg-[var(--color-ribbon-green)]/25 px-0.5 font-semibold text-[var(--color-text)]'}
						>{m.word}</span
					>{' '}{/each}
			</p>
		{/if}

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
		<div class="mt-3 flex gap-2">
			<button
				type="button"
				onclick={() => choose({ kind: 'flawed' })}
				class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
			>
				이상 있음
			</button>
			<button
				type="button"
				onclick={() => choose({ kind: 'clean' })}
				class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
			>
				이상 없음
			</button>
		</div>
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
