<script lang="ts">
	import { tick } from 'svelte';
	import { hasTypedOpening, openingOf } from '$lib/memorize/timing';
	import { submitsOnEnter } from '$lib/memorize/typing';
	import { OPENING_GAME_WORDS } from '$lib/quiz/games';
	import type { QuizItem, RoundResult } from '$lib/quiz/session';
	import QuizTicker from './QuizTicker.svelte';
	import RaidStage from '$lib/components/arcade/RaidStage.svelte';
	import ComboBadge from '$lib/components/arcade/ComboBadge.svelte';
	import OutcomeStamp from '$lib/components/arcade/OutcomeStamp.svelte';
	import { arcade } from '$lib/state/arcade.svelte';
	import { RAID_LIMIT_MS, raidPhase, raidRemainingMs, raidScore } from '$lib/arcade/raid';

	interface Props {
		item: QuizItem;
		/** 0-based; shown to the reader 1-based. */
		index: number;
		total: number;
		/** The chain the session is carrying into this round. */
		streak?: number;
		/** How many opening words count as having started the verse. The
		 *  reader's choice, made on the start screen — a round cannot change it
		 *  under itself, or the bar would move mid-answer. */
		words?: number;
		/** Fired once, when the reader leaves this round. */
		onDone: (result: RoundResult) => void;
	}
	let { item, index, total, streak = 0, words = OPENING_GAME_WORDS, onDone }: Props = $props();

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
	const opening = $derived(openingOf(item.w, words));

	/** Graded continuously — there is no 제출. Leaving is still a separate
	 *  step, so the reader sees the verdict before the round is swapped out.
	 *
	 * Latched, not re-derived: reaching the opening is an event, not a state
	 * the text can be edited back out of. Without the latch, backspacing past
	 * the opening would un-grade a pass already earned — 통과 and 다음 would
	 * vanish, 모르겠어요 would return, and pressing it would record a failure
	 * for a verse the reader had just demonstrably started. */
	let done = $state(false);
	/** Milliseconds on the clock when the round was decided, kept so the score
	 *  cannot drift with the frames that follow the answer. */
	let decidedAt = $state<number | null>(null);
	$effect(() => {
		if (done) return;
		if (gaveUp || hasTypedOpening(item.w, typed, words)) {
			decidedAt = Date.now() - startedAt;
			done = true;
			if (gaveUp) {
				arcade.play('fail');
			} else {
				arcade.play('shot');
				// The blast follows the beam. Fired together they read as the
				// raider having come apart on its own.
				setTimeout(() => arcade.play('explode'), 90);
			}
			// The box is about to be replaced by a record of what was typed in
			// it, so whatever focus was on stops existing. Hand it to the only
			// control left rather than letting it fall to <body>.
			tick().then(() => nextButton?.focus());
			// A solved verse moves on by itself. Sitting on 통과 waiting to be
			// told to continue is the reader doing the app's bookkeeping, and
			// this game is a rally — the whole appeal is the next one arriving.
			//
			// After a beat, not at once: the shot, the blast and the stamp all
			// land inside it, and cutting them off would take the hit away.
			// Only on a pass — 모르겠어요 has just revealed the opening, and a
			// reader who has been shown the answer is reading it.
			if (!gaveUp) advanceTimer = setTimeout(next, ADVANCE_MS);
		}
	});

	/** The raider's clock. Read at 10Hz — enough for a countdown and for the
	 *  alarm, and far cheaper than the frame loop the canvas runs for the
	 *  drawing. The canvas reads `startedAt` itself rather than this. */
	let elapsedMs = $state(0);
	/** The last whole second the alarm sounded on, so it beeps once a second
	 *  rather than ten times. */
	let beepedAt = -1;
	$effect(() => {
		if (done) return;
		const id = setInterval(() => {
			elapsedMs = Date.now() - startedAt;
			if (elapsedMs >= RAID_LIMIT_MS) {
				// The raider arrived. This is 모르겠어요 by another route — the
				// same verdict, the same revealed opening — so nothing about the
				// grading has to learn a new outcome.
				gaveUp = true;
				return;
			}
			if (raidPhase(elapsedMs, RAID_LIMIT_MS) !== 'alarm') return;
			const second = Math.ceil(raidRemainingMs(elapsedMs, RAID_LIMIT_MS) / 1000);
			if (second !== beepedAt) {
				beepedAt = second;
				arcade.play('alarm');
			}
		}, 100);
		return () => clearInterval(id);
	});

	const outcome = $derived(done ? (gaveUp ? 'impact' : 'destroyed') : null);

	const secondsLeft = $derived(Math.ceil(raidRemainingMs(elapsedMs, RAID_LIMIT_MS) / 1000));

	let inputEl = $state<HTMLInputElement | undefined>();
	/** The 다음 button, once the round is graded. */
	let nextButton = $state<HTMLButtonElement | undefined>();

	/** Long enough for the hit to read, short enough not to be a wait. */
	const ADVANCE_MS = 700;
	let advanceTimer: ReturnType<typeof setTimeout> | null = null;
	// A round can be left before its timer fires — 다음 pressed, or the session
	// ended — and a timer outliving its component would report a round that is
	// no longer on screen.
	$effect(() => () => {
		if (advanceTimer !== null) clearTimeout(advanceTimer);
	});

	// The route keys each round, so this component is new for every card and
	// this runs once per verse: 다음 leaves the reader on the next one ready to
	// type — keyboard already up on a phone — rather than one tap short of it.
	$effect(() => {
		inputEl?.focus();
	});

	function giveUp() {
		gaveUp = true;
		// Focus is handed over by the effect above, which every route into a
		// graded round passes through.
	}

	/** Enter is 다음. Before the opening is produced it is nothing: `next`
	 *  refuses an ungraded round, and standing in for 모르겠어요 would record a
	 *  failure the reader never asked for. A composing Enter is ignored the
	 *  same way the typing round ignores it — Korean input commits syllables
	 *  with that key.
	 *
	 *  On window rather than on the box, because once the round is graded the
	 *  box is gone: what the reader wrote is shown back as a record instead of
	 *  an editable field, and Enter still has to reach 다음 from wherever
	 *  focus ended up. */
	function onKeydown(e: KeyboardEvent) {
		if (!submitsOnEnter(e)) return;
		e.preventDefault();
		next();
	}

	function next() {
		if (!done || reported) return;
		if (advanceTimer !== null) {
			clearTimeout(advanceTimer);
			advanceTimer = null;
		}
		reported = true;
		onDone({
			id: item.id,
			passed: !gaveUp,
			// A verdict, not a measurement: 1 means "started it", not "recited
			// it". Nothing counts quiz-opening as recall.
			accuracy: gaveUp ? 0 : 1,
			missed: [],
			elapsedMs: Date.now() - startedAt,
			// Nothing is paid for a round the raider won, however it was lost.
			points: gaveUp
				? 0
				: raidScore(raidRemainingMs(decidedAt ?? RAID_LIMIT_MS, RAID_LIMIT_MS), RAID_LIMIT_MS),
			// Shooting the raider down is what beating this round's clock means.
			// There is no second, gentler deadline to miss.
			inTime: !gaveUp
		});
	}
</script>

<svelte:window onkeydown={onKeydown} />

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

	<!-- Both rails sit under the board, as two lines together: what the verse
	     says and what the reader wrote, one above the other, which is the
	     comparison the round exists to make. Above the board the answer was
	     across the card from the attempt and the two had to be read apart.
	     Always here, empty while the round runs, so the answer landing changes
	     nothing about the layout. -->

	<div class="relative">
		<RaidStage {startedAt} {outcome} />
		{#if done}
			<OutcomeStamp outcome={gaveUp ? 'fail' : 'pass'} />
		{/if}
	</div>

	<QuizTicker testid="quiz-answer" label="정답" text={done ? item.w : ''} />
	<QuizTicker testid="quiz-attempt" label="입력한 내용" text={done ? typed : ''} />

	<!-- The verdict in words. The board and the stamp say it on screen; this is
	     for a reader who has neither, and it is the only place the result is
	     spoken now that the card has gone. -->
	<p class="sr-only" role="status" aria-live="polite">
		{done ? (gaveUp ? '다시 볼 구절입니다' : '정답입니다') : `${secondsLeft}초 남았습니다`}
	</p>

	<!-- One line, because the answer is a handful of words. A textarea also spends
	     Enter on a newline, and here Enter is 다음.
	     Kept in the layout once the round is graded rather than removed: the
	     button under it is where the reader's thumb already is, and taking the
	     box away moved that button up under their finger. -->
	<input
		bind:this={inputEl}
		bind:value={typed}
		disabled={done}
		aria-hidden={done}
		type="text"
		aria-label="구절 첫머리 입력"
		enterkeyhint="next"
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		class="mt-3 w-full rounded-xl bg-[var(--color-elevated)] px-3 py-2.5 text-[calc(16px*var(--vfs))] text-[var(--color-text)] {done
			? 'invisible'
			: ''}"
	/>

	<!-- One control, in one place. -->
	<button
		bind:this={nextButton}
		type="button"
		onclick={done ? next : giveUp}
		class="mt-3 w-full rounded-xl py-2.5 font-medium {done
			? 'bg-[var(--color-accent)] text-white'
			: 'bg-[var(--color-elevated)] text-[var(--color-text)]'}"
	>
		{done ? '다음' : '모르겠어요'}
	</button>

	{#if gaveUp}
		<!-- The opening the round actually asked for. 정답 above has the
		     whole verse, which is more than the question was. -->
		<p class="mt-2 text-[calc(12px*var(--vfs))] text-[var(--color-text-secondary)]">
			첫 세 단어 · <span class="font-semibold text-[var(--color-text)]">{opening}</span>
		</p>
	{/if}
</div>
