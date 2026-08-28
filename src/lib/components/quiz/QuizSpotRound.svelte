<script lang="ts">
	import { tick } from 'svelte';
	import { markMismatchedWords } from '$lib/memorize/grade';
	import { findSpotFlaws } from '$lib/quiz/spot';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';
	import ComboMeter from '$lib/components/arcade/ComboMeter.svelte';
	import ShatterReveal from '$lib/components/arcade/ShatterReveal.svelte';
	import { arcade } from '$lib/state/arcade.svelte';
	import { SPOT_HIT_POINTS, comboLimitMs } from '$lib/arcade/combo';
	import QuizAnswer from './QuizAnswer.svelte';

	interface Props {
		item: QuizItem;
		/** The text to show: a recorded attempt, or the verse itself when the
		 *  reader has none for it. */
		shown: string;
		index: number;
		total: number;
		/** The chain the session is carrying into this round. */
		streak?: number;
		onDone: (result: RoundResult) => void;
	}
	let { item, shown, index, total, streak = 0, onDone }: Props = $props();

	/** Scaled to the sentence: a flat limit would be generous for 여호와여 and
	 *  impossible for sixty characters. */
	const limitMs = $derived(comboLimitMs(shown.length));
	/** Whether the answer beat the clock. Latched at the answer, because the
	 *  reader then sits on the verdict screen and the clock would keep running
	 *  past it. */
	let inTime = $state(true);

	/**
	 * The reader's verdict: is anything wrong, or not. Undefined while they are
	 * still deciding.
	 *
	 * Naming the word was an answer here once, and it asked a second, harder
	 * question on top of the first: a reader who can see the sentence is off
	 * has recognised the flaw, which is what this game tests. It also could not
	 * be answered at all when the flaw was a word that had been dropped — there
	 * was nothing on screen to name. The words stay on screen as the question
	 * and are marked afterwards as the answer; they are not the input.
	 */
	type Answer = 'flawed' | 'clean';
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

	/** The answer arrives behind a wall, which comes down a beat later. The
	 *  beat is the point: a wall already in pieces on the frame it appears was
	 *  never a wall. */
	let revealed = $state(false);
	$effect(() => {
		if (!answered || revealed) return;
		const id = setTimeout(() => {
			revealed = true;
			arcade.play('shatter');
		}, 260);
		return () => clearTimeout(id);
	});
	const correct = $derived(answered && (answer === 'flawed') === flaws.flawed);

	/** The 다음 button, once the answer is in. */
	let nextButton = $state<HTMLButtonElement | undefined>();

	function choose(a: Answer) {
		if (answered) return;
		inTime = Date.now() - startedAt <= limitMs;
		answer = a;
		// Read from the fresh verdict rather than `correct`, which is derived
		// and has not been recomputed yet on this line.
		const right = a === 'clean' ? !flaws.flawed : flaws.flawed;
		if (right) arcade.play('select');
		else arcade.play('fail');
		// Answering removes the button that was just pressed, so whatever the
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
			elapsedMs: Date.now() - startedAt,
			// The round's own worth, before the session's chain multiplies it.
			points: correct ? SPOT_HIT_POINTS : 0,
			inTime
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

	<ComboMeter {startedAt} {limitMs} {streak} frozen={answered} late={answered && !inTime} />

	<!-- Plain text now, not a strip of targets. The two buttons are the whole
	     answer, so nothing here needs a role, a tab stop, or a hint line
	     explaining that the words can be pressed. -->
	<p class="mt-3 text-[calc(16px*var(--vfs))] leading-[1.9] break-keep">
		{#each words as word, i (i)}<span
				class="word"
				class:wrong={answered && flaws.wrong.includes(i)}>{word}</span
			>{' '}{/each}
	</p>

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

		<ShatterReveal broken={revealed} label="정답">
			<QuizAnswer w={item.w} />
		</ShatterReveal>
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
				onclick={() => choose('flawed')}
				class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
			>
				이상 있음
			</button>
			<button
				type="button"
				onclick={() => choose('clean')}
				class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
			>
				이상 없음
			</button>
		</div>
	{/if}
</div>

<style>
	/* The word that does not belong. Red rather than the accent:
	   this is the result of a test, not a note the reader left themselves. */
	.wrong {
		color: var(--color-danger);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
</style>
