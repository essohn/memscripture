<script lang="ts">
	import { tick } from 'svelte';
	import { markMismatchedWords } from '$lib/memorize/grade';
	import { findSpotFlaws } from '$lib/quiz/spot';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';
	import ComboMeter from '$lib/components/arcade/ComboMeter.svelte';
	import OutcomeStamp from '$lib/components/arcade/OutcomeStamp.svelte';
	import { arcade } from '$lib/state/arcade.svelte';
	import { ownsEnter, submitsOnEnter } from '$lib/memorize/typing';
	import { SPOT_HIT_POINTS, comboLimitMs } from '$lib/arcade/combo';
	import QuizTicker from './QuizTicker.svelte';
	import QuizRatingDrop from './QuizRatingDrop.svelte';
	import type { DifficultyLevel } from '$lib/db/verseRatings';

	interface Props {
		item: QuizItem;
		/** The text to show: a recorded attempt, or the verse itself when the
		 *  reader has none for it. */
		shown: string;
		index: number;
		total: number;
		/** The chain the session is carrying into this round. */
		streak?: number;
		/** This verse's rating in the dimension this game tests, before the
		 *  round. A miss takes it down a step; the page does the writing. */
		rating?: DifficultyLevel | null;
		onDone: (result: RoundResult) => void;
	}
	let { item, shown, index, total, streak = 0, rating = null, onDone }: Props = $props();

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

	/**
	 * Enter moves on once the verdict is up.
	 *
	 * Never before it: this round is answered by choosing between two calls,
	 * and an Enter that picked one for the reader would record a verdict they
	 * did not give. A composing Enter is ignored the same way everywhere else
	 * in the app ignores it.
	 */
	function onWindowKeydown(e: KeyboardEvent) {
		if (!answered || !submitsOnEnter(e)) return;
		// A keyboard reader pressing Enter on 이상 있음 fires that button and
		// the same keystroke carries on up to here, where the round it just
		// answered is answered. One Enter, one thing.
		if (ownsEnter(e.target)) return;
		e.preventDefault();
		next();
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
			// A miss is this game's evidence that the verse is harder.
			harder: !correct,
			inTime
		});
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="rounded-2xl bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
	<div class="flex items-baseline justify-between">
		<h2 class="text-[calc(16px*var(--vfs))] font-semibold text-[var(--color-text)]">
			{item.title}
		</h2>
		<span class="text-[11px] text-[var(--color-text-tertiary)]">{index + 1} / {total}</span>
	</div>
	<p class="mt-0.5 text-[calc(14px*var(--vfs))] text-[var(--color-text-secondary)]">{item.cite}</p>

	<ComboMeter {startedAt} {limitMs} {streak} frozen={answered} late={answered && !inTime} />

	<!-- Plain text: the two buttons are the whole answer, so nothing here needs
	     a role, a tab stop, or a hint line explaining that the words can be
	     pressed. This sentence is the board, so the stamp lands on it. -->
	<div class="relative">
		<p class="mt-3 text-[calc(16px*var(--vfs))] leading-[1.9] break-keep">
			{#each words as word, i (i)}<span
					class="word"
					class:wrong={answered && flaws.wrong.includes(i)}>{word}</span
				>{' '}{/each}
		</p>
		{#if answered}
			<OutcomeStamp outcome={correct ? 'pass' : 'fail'} />
		{/if}
	</div>

	<QuizTicker testid="quiz-answer" label="정답" text={answered ? item.w : ''} />

	{#if answered && !correct}
		<QuizRatingDrop label="전체 난이도" from={rating} />
	{/if}

	<p class="sr-only" role="status" aria-live="polite">
		{answered ? (correct ? '정답입니다' : '다시 볼 구절입니다') : ''}
	</p>

	<!-- One control row, in one place: two choices while the round is live, 다음
	     once it is answered, all the same height. Everything the answer adds
	     goes below it, so nothing the reader is about to press moves. -->
	{#if answered}
		<button
			bind:this={nextButton}
			type="button"
			onclick={next}
			class="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다음
		</button>


		{#if showDropped}
			<!-- Nothing on screen was wrong, so nothing on screen can be marked.
			     What the reader has to see is the sentence they should have
			     written, with the dropped words called out in it. -->
			<p
				class="mt-3 text-[10.5px] font-medium tracking-[0.16em] text-[var(--color-text-tertiary)] uppercase"
			>
				빠진 단어
			</p>
			<p
				data-testid="dropped-words"
				class="mt-1 text-[calc(12px*var(--vfs))] leading-[1.55] break-keep"
			>
				{#each verseWords as m, i (i)}<span
						class={m.ok
							? 'text-[var(--color-text-secondary)]'
							: 'rounded bg-[var(--color-ribbon-green)]/25 px-0.5 font-semibold text-[var(--color-text)]'}
						>{m.word}</span
					>{' '}{/each}
			</p>
		{/if}
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
