<script lang="ts">
	import { tick } from 'svelte';
	import { hasTypedOpening, openingOf } from '$lib/memorize/timing';
	import { submitsOnEnter } from '$lib/memorize/typing';
	import { OPENING_GAME_WORDS } from '$lib/quiz/games';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';

	interface Props {
		item: QuizItem;
		/** 0-based; shown to the reader 1-based. */
		index: number;
		total: number;
		/** Fired once, when the reader leaves this round. */
		onDone: (result: RoundResult) => void;
	}
	let { item, index, total, onDone }: Props = $props();

	let typed = $state('');
	/** Set by 모르겠어요. A revealed opening is a failure however the reader
	 *  types afterwards. */
	let gaveUp = $state(false);
	let reported = $state(false);

	/** Measured from when the round appears, not from the first keystroke —
	 *  the pause before starting is part of recalling how a verse opens. */
	const startedAt = Date.now();

	/** The words that count as having started. Shown only after 모르겠어요.
	 *  Sliced by timing.ts rather than here — the count lives in one place or
	 *  it is two definitions of the same thing. */
	const opening = $derived(openingOf(item.w, OPENING_GAME_WORDS));

	/** Graded continuously — there is no 제출. Leaving is still a separate
	 *  step, so the reader sees the verdict before the round is swapped out.
	 *
	 * Latched, not re-derived: reaching the opening is an event, not a state
	 * the text can be edited back out of. Without the latch, backspacing past
	 * the opening would un-grade a pass already earned — 통과 and 다음 would
	 * vanish, 모르겠어요 would return, and pressing it would record a failure
	 * for a verse the reader had just demonstrably started. */
	let done = $state(false);
	$effect(() => {
		if (!done && (gaveUp || hasTypedOpening(item.w, typed, OPENING_GAME_WORDS))) done = true;
	});

	let inputEl = $state<HTMLInputElement | undefined>();
	/** The 다음 button, once the round is graded. */
	let nextButton = $state<HTMLButtonElement | undefined>();

	// The route keys each round, so this component is new for every card and
	// this runs once per verse: 다음 leaves the reader on the next one ready to
	// type — keyboard already up on a phone — rather than one tap short of it.
	$effect(() => {
		inputEl?.focus();
	});

	function giveUp() {
		gaveUp = true;
		// The press takes away the button it came from, so the browser drops
		// focus to <body> — the same hole 틀린 곳 찾기 had. Hand it to the only
		// control left, where Enter and Space still do something.
		tick().then(() => nextButton?.focus());
	}

	/** Enter is 다음. Before the opening is produced it is nothing: `next`
	 *  refuses an ungraded round, and standing in for 모르겠어요 would record a
	 *  failure the reader never asked for. A composing Enter is ignored the
	 *  same way the typing round ignores it — Korean input commits syllables
	 *  with that key. */
	function onKeydown(e: KeyboardEvent) {
		if (!submitsOnEnter(e)) return;
		e.preventDefault();
		next();
	}

	function next() {
		if (!done || reported) return;
		reported = true;
		onDone({
			id: item.id,
			passed: !gaveUp,
			// A verdict, not a measurement: 1 means "started it", not "recited
			// it". Nothing counts quiz-opening as recall.
			accuracy: gaveUp ? 0 : 1,
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

	<!-- One line, because the answer is three words. A textarea also spends
	     Enter on a newline, and here Enter is 다음. -->
	<input
		bind:this={inputEl}
		bind:value={typed}
		onkeydown={onKeydown}
		type="text"
		aria-label="구절 첫머리 입력"
		enterkeyhint="next"
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] px-3 py-2.5 text-[calc(16px*var(--vfs))] text-[var(--color-text)]"
	/>

	{#if gaveUp}
		<p class="mt-2 text-[calc(16px*var(--vfs))] font-medium text-[var(--color-text)]">{opening}</p>
	{/if}

	{#if done}
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{gaveUp ? '다시 볼 구절' : '통과'}
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
			onclick={giveUp}
			class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			모르겠어요
		</button>
	{/if}
</div>
