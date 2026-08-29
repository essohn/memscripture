<script lang="ts">
	import { accuracyOf, markAttemptWords, markMismatchedWords } from '$lib/memorize/grade';
	import { submitsOnEnter } from '$lib/memorize/typing';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';
	import QuizTicker from './QuizTicker.svelte';
	import OutcomeStamp from '$lib/components/arcade/OutcomeStamp.svelte';
	import ComboBadge from '$lib/components/arcade/ComboBadge.svelte';
	import DefuseStage from '$lib/components/arcade/DefuseStage.svelte';
	import { remainingMs } from '$lib/arcade/clock';
	import { defuseLimitMs, defusePhase } from '$lib/arcade/defuse';
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

	/**
	 * The reader's own words, with the ones the verse cannot account for marked.
	 *
	 * markMismatchedWords was rendering here, and it answers a different
	 * question: whether each *verse* word turns up in the attempt. Its result is
	 * a list of the verse's words, so this block was showing the reader text
	 * they never wrote — and, worse, a word they had added was not something it
	 * could mark at all, while accuracyOf took it off the score. The round
	 * failed with nothing marked, which is how a verse the reader had plainly
	 * got right came back wrong.
	 */
	const attemptMarks = $derived(verdict ? markAttemptWords(item.w, typed) : []);

	/** Scaled to the verse: a flat clock is generous for a short one and
	 *  impossible for a long one. */
	const limitMs = $derived(defuseLimitMs(item.w.length));
	/** Read at 10Hz for the alarm and the auto-submit. The board runs its own
	 *  frame loop off `startedAt` for the drawing. */
	let elapsedMs = $state(0);
	/** The last whole second the alarm sounded on, so it beeps once a second
	 *  rather than ten times. */
	let beepedAt = -1;
	$effect(() => {
		if (verdict) return;
		const id = setInterval(() => {
			elapsedMs = Date.now() - startedAt;
			if (elapsedMs >= limitMs) {
				// The bomb goes off with whatever is in the box. Grading it as
				// written is the honest thing and the cheap thing: nothing about
				// the record has to learn that a clock can mark a verse wrong.
				submit(true);
				return;
			}
			if (defusePhase(elapsedMs, limitMs) !== 'alarm') return;
			const second = Math.ceil(remainingMs(elapsedMs, limitMs) / 1000);
			if (second !== beepedAt) {
				beepedAt = second;
				arcade.play('alarm');
			}
		}, 100);
		return () => clearInterval(id);
	});

	const outcome = $derived(verdict === null ? null : verdict.passed ? 'defused' : 'blown');
	const secondsLeft = $derived(Math.ceil(remainingMs(elapsedMs, limitMs) / 1000));

	function submit(force = false) {
		if (verdict) return;
		if (!force && typed.trim().length === 0) return;
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
		// Only the miss speaks here. Being right is announced by the chime that
		// lands with the Correct! stamp a moment later — an explosion on top of
		// it was the '둥' in front of the '딩동댕'.
		if (!passed) {
			arcade.play('fail');
			// The buzzer is the verdict; the blast is the bomb. A beat apart so
			// they read as two things rather than one noise.
			setTimeout(() => arcade.play('explode'), 130);
		}
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

	<!-- 정답 above the board and 입력한 내용 below it, each one line high
	     whatever the verse is. Both rails are always here, empty while the
	     round runs, so the answer landing changes nothing about the layout. -->
	<QuizTicker testid="quiz-answer" label="정답" text={verdict === null ? '' : item.w} />

	<div class="relative">
		<DefuseStage {startedAt} {limitMs} {outcome} />
		{#if verdict !== null}
			<OutcomeStamp outcome={verdict.passed ? 'pass' : 'fail'} />
		{/if}
	</div>

	<QuizTicker testid="quiz-attempt" label="입력한 내용" text={verdict === null ? '' : typed} marks={attemptMarks} />

	<!-- The verdict in words, for a reader who has neither the board nor the
	     stamp. The only place the result is spoken now that the card has
	     gone. -->
	<p class="sr-only" role="status" aria-live="polite">
		{verdict === null
			? `${secondsLeft}초 남았습니다`
			: verdict.passed
				? '정답입니다'
				: '다시 볼 구절입니다'}
	</p>

	<!-- The box stays in the layout once the answer is in, hidden and out of
	     the tab order. Taking it away moved the button up under the thumb that
	     had just pressed 제출. -->
	<textarea
		bind:value={typed}
		onkeydown={onKeydown}
		disabled={verdict !== null}
		aria-hidden={verdict !== null}
		aria-label="암송 구절 입력"
		rows="3"
		class="mt-3 w-full resize-none rounded-xl bg-[var(--color-elevated)] p-3 text-[calc(16px*var(--vfs))] leading-[1.8] text-[var(--color-text)] {verdict !==
		null
			? 'invisible'
			: ''}"
	></textarea>

	<!-- One control, in one place. -->
	<button
		type="button"
		onclick={() => (verdict === null ? submit() : next())}
		disabled={verdict === null && typed.trim().length === 0}
		class="mt-3 w-full rounded-xl py-2.5 font-medium disabled:opacity-40 {verdict === null
			? 'bg-[var(--color-accent)] text-white'
			: 'bg-[var(--color-elevated)] text-[var(--color-text)]'}"
	>
		{verdict === null ? '제출' : '다음'}
	</button>
</div>
