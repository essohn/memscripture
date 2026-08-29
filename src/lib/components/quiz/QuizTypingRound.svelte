<script lang="ts">
	import { accuracyOf, markMismatchedWords } from '$lib/memorize/grade';
	import { submitsOnEnter } from '$lib/memorize/typing';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';
	import QuizAnswer from './QuizAnswer.svelte';
	import QuizVerdict from './QuizVerdict.svelte';
	import AnswerReveal from '$lib/components/arcade/AnswerReveal.svelte';
	import QuizAttempt from './QuizAttempt.svelte';
	import ComboBadge from '$lib/components/arcade/ComboBadge.svelte';
	import { arcade } from '$lib/state/arcade.svelte';
	import { PERFECT_POINTS } from '$lib/arcade/combo';

	interface Props {
		item: QuizItem;
		/** 0-based; shown to the reader 1-based. */
		index: number;
		total: number;
		/** The chain the session is carrying into this round. */
		streak?: number;
		/** Fired once, when the reader leaves this round. */
		onDone: (result: RoundResult) => void;
	}
	let { item, index, total, streak = 0, onDone }: Props = $props();

	let typed = $state('');
	/** The verdict, or null while the reader is still answering. */
	let verdict = $state<RoundResult | null>(null);

	/** Measured from when the round appears, not from the first keystroke —
	 *  the pause before starting to type is part of recalling the verse, and
	 *  the card's check measures it the same way. */
	const startedAt = Date.now();

	const marks = $derived(verdict ? markMismatchedWords(item.w, typed) : []);

	function submit() {
		if (typed.trim().length === 0 || verdict) return;
		const accuracy = accuracyOf(item.w, typed);
		const passed = accuracy >= 1;
		verdict = {
			id: item.id,
			passed,
			accuracy,
			missed: markMismatchedWords(item.w, typed).flatMap((m, i) => (m.ok ? [] : [i])),
			elapsedMs: Date.now() - startedAt,
			typed,
			// The round's own worth, before the session's chain multiplies it.
			points: passed ? PERFECT_POINTS : 0,
			// This game runs no clock of its own — a whole verse under a timer
			// would be measuring thumbs — so a pass always extends the chain.
			inTime: true
		};
		arcade.play(passed ? 'explode' : 'fail');
	}


	function onKeydown(e: KeyboardEvent) {
		if (!submitsOnEnter(e)) return;
		e.preventDefault();
		submit();
	}

	/** A round reports itself once. The verdict screen stays up until the
	 *  parent swaps this component out, so 다음 is tappable more than once —
	 *  and the route advances its index off this call, so a second report
	 *  would skip the next verse entirely. */
	let reported = $state(false);

	function next() {
		if (!verdict || reported) return;
		reported = true;
		// Handed out as plain data, not reactive state. IndexedDB cannot
		// structured-clone a Proxy, and a caller that persists this would fail
		// silently — which is exactly what happened before recordCheck started
		// copying `missed`.
		onDone($state.snapshot(verdict));
	}
</script>

<div class="rounded-2xl bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
	<div class="flex items-baseline justify-between">
		<h2 class="text-[calc(16px*var(--vfs))] font-semibold text-[var(--color-text)]">
			{item.title}
		</h2>
		<span class="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
			<ComboBadge {streak} />
			{index + 1} / {total}
		</span>
	</div>
	<p class="mt-0.5 text-[calc(14px*var(--vfs))] text-[var(--color-text-secondary)]">{item.cite}</p>

	{#if verdict === null}
		<textarea
			bind:value={typed}
			onkeydown={onKeydown}
			aria-label="암송 구절 입력"
			rows="4"
			class="mt-3 w-full resize-none rounded-xl bg-[var(--color-elevated)] p-3 text-[calc(16px*var(--vfs))] leading-[1.8] text-[var(--color-text)]"
		></textarea>
		<button
			type="button"
			onclick={submit}
			disabled={typed.trim().length === 0}
			class="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white disabled:opacity-40"
		>
			제출
		</button>
	{:else}
		<QuizAttempt {typed} {marks} />
		<AnswerReveal reveal={verdict !== null} outcome={verdict.passed ? 'pass' : 'fail'} label="정답">
			<QuizAnswer w={item.w} />
		</AnswerReveal>
		<QuizVerdict passed={verdict.passed} />
		<button
			type="button"
			onclick={next}
			class="mt-2 w-full rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			다음
		</button>
	{/if}
</div>
