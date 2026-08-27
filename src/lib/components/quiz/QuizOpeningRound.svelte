<script lang="ts">
	import { hasTypedOpening, openingOf } from '$lib/memorize/timing';
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
	 *  Borrowed from timing.ts rather than sliced here — the number lives in
	 *  one place or it is two definitions of the same thing. */
	const opening = $derived(openingOf(item.w));

	/** Graded continuously — there is no 제출. Leaving is still a separate
	 *  step, so the reader sees the verdict before the round is swapped out. */
	const done = $derived(gaveUp || hasTypedOpening(item.w, typed));

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

	<textarea
		bind:value={typed}
		aria-label="구절 첫머리 입력"
		rows="2"
		class="mt-3 w-full resize-none rounded-xl bg-[var(--color-elevated)] p-3 text-[calc(16px*var(--vfs))] leading-[1.8] text-[var(--color-text)]"
	></textarea>

	{#if gaveUp}
		<p class="mt-2 text-[calc(16px*var(--vfs))] font-medium text-[var(--color-text)]">{opening}</p>
	{/if}

	{#if done}
		<p class="mt-3 text-[calc(13px*var(--vfs))] font-medium">
			{gaveUp ? '다시 볼 구절' : '통과'}
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
			onclick={() => (gaveUp = true)}
			class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			모르겠어요
		</button>
	{/if}
</div>
