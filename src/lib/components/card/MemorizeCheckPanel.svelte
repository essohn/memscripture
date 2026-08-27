<script lang="ts">
	import DifficultyBadge from './DifficultyBadge.svelte';
	import Confetti from '$lib/components/feedback/Confetti.svelte';
	import type { CheckRecord } from '$lib/db/local';
	import { DIFFICULTY_LABELS, type DifficultyLevel } from '$lib/db/verseRatings';
	import {
		accuracyOf,
		fullDifficultyFrom,
		markAttemptWords,
		markMismatchedWords,
		nextHint,
		paceScale,
		normalizeForGrading,
		type Hint
	} from '$lib/memorize/grade';
	import { submitsOnEnter } from '$lib/memorize/typing';
	import { hasTypedOpening, startDifficultyFor } from '$lib/memorize/timing';
	import { isSpeechSupported, joinSpoken, startSpeech, type SpeechSession } from '$lib/memorize/speech';
	import { Mic, Square } from 'lucide-svelte';

	interface Props {
		verse: string;
		/** Past checks, newest first. Empty until the verse has been checked. */
		history?: CheckRecord[];
		/** The ratings this verse already carries. Snapshotted when the panel
		 *  opens: grading reads the previous 전체 level, and the reader is offered
		 *  a way back to it — both of which need the value from before the check
		 *  overwrote it. */
		currentStart?: DifficultyLevel | null;
		currentFull?: DifficultyLevel | null;
		/** The verse was played aloud before this attempt. Counts as assistance
		 *  the same way a hint does. */
		heardAloud?: boolean;
		/** Per dimension rather than one combined result, so this component can
		 *  express the difference between "no start rating was measurable, leave
		 *  whatever is there" and "the reader cleared it". A single payload
		 *  cannot say both with one null. */
		onPickStart: (level: DifficultyLevel | null) => void;
		onPickFull: (level: DifficultyLevel | null) => void;
		/** Fired once a result is recorded, so the card can lift the curtain —
		 *  hiding the verse has no purpose after it has been graded — and log
		 *  the attempt. Only fires on a real save, never on 취소, so the history
		 *  reads as "checks I finished". */
		onGraded: (outcome: {
			start: DifficultyLevel | null;
			full: DifficultyLevel | null;
			accuracy: number;
			elapsedMs: number;
			hints: number;
			missed: number[];
			typed: string;
		}) => void;
		/** 닫기: leave memorize mode and return to the ordinary card. */
		onClose: () => void;
		/** A fresh attempt is starting — 다시 from the success screen, or 취소 out
		 *  of a confirmation. The card uses it to cover the verse back up: saving
		 *  reveals it, which is right once the check is over, but leaving the
		 *  answer on screen would turn the next attempt into copying. */
		onRestart?: () => void;
	}
	let {
		verse,
		history = [],
		currentStart = null,
		currentFull = null,
		heardAloud = false,
		onPickStart,
		onPickFull,
		onGraded,
		onClose,
		onRestart
	}: Props = $props();

	// Read once. The panel is created fresh for each check, and these must
	// survive the write that the check itself performs.
	// svelte-ignore state_referenced_locally
	const priorStart = currentStart;
	// svelte-ignore state_referenced_locally
	const priorFull = currentFull;

	/** What this check graded the 전체 rating as — kept apart from `saved`, which
	 *  follows whatever the reader has since chosen. */
	let gradedFull = $state<DifficultyLevel | null>(null);

	/**
	 * Something in this session went wrong: an attempt was submitted flawed, or
	 * 포기 was pressed. Once true it stays true until the panel is closed.
	 *
	 * The only state restart() deliberately leaves alone. Everything else is
	 * cleared so the next attempt is timed and scored on its own, but a retry
	 * made after reading the marked answer is not an independent attempt — the
	 * reader has just been shown the verse. Without this the flawless-attempt
	 * climb would run on it and rate a verse they had failed a moment earlier
	 * as easier than before.
	 */
	let missedInSession = $state(false);

	let typed = $state('');
	let inputEl = $state<HTMLTextAreaElement | undefined>();

	// Focus the box as soon as it exists, so 점검 goes straight to typing rather
	// than costing a second tap. It re-runs whenever the element is replaced —
	// after 취소 or 다시 — which is exactly when the reader wants to type again.
	// This does not start the clock: that still waits for the first keystroke.
	$effect(() => {
		inputEl?.focus();
	});
	let elapsedMs = $state(0);
	/** Set the moment the opening is first produced, then never revised — the
	 *  reading is "how long to recall the start", not "how long in total". */
	let openingAtMs = $state<number | null>(null);
	let confirming = $state(false);
	let proposed = $state<{ start: DifficultyLevel | null; full: DifficultyLevel | null } | null>(
		null
	);
	/** True when the confirmation was reached by 포기 rather than by 제출, which
	 *  changes the copy and withholds any proposal of our own. */
	let gaveUp = $state(false);
	/** Set once the result is written, which swaps the input for a summary.
	 *  Without it a perfect attempt saved in silence and left the panel
	 *  untouched — the reader who recited it best got no reply at all. */
	let saved = $state<{ start: DifficultyLevel | null; full: DifficultyLevel | null } | null>(null);
	/**
	 * Set only by a flawless attempt, and only there.
	 *
	 * Not derived from saved.full === 5: the reader can raise a flawed attempt
	 * to 5 by hand afterwards, and confetti for a rating they awarded
	 * themselves would celebrate the wrong thing.
	 */
	let celebrate = $state(false);

	/**
	 * Seconds left before the success view closes itself, or null once it is not
	 * closing.
	 *
	 * Safe to automate because nothing is lost: the result is already written by
	 * the time this view appears, and reopening is one tap. That is the
	 * difference from the auto-commit countdown this app removed earlier — that
	 * one performed a write on the reader's behalf.
	 */
	const AUTO_CLOSE_SECONDS = 5;
	let closingIn = $state<number | null>(null);

	/** Any deliberate touch inside the panel stops the clock. The success view
	 *  carries editable difficulty badges, and closing while someone is choosing
	 *  a level would take the screen out from under them. */
	function cancelAutoClose() {
		closingIn = null;
	}

	/** Whether the success view is up — deliberately a boolean rather than
	 *  `saved` itself. Adjusting a level reassigns `saved`, and an effect that
	 *  depended on the object restarted the countdown on the very interaction
	 *  that was supposed to stop it. */
	const showingSuccess = $derived(saved !== null);

	$effect(() => {
		if (!showingSuccess) {
			closingIn = null;
			return;
		}
		closingIn = AUTO_CLOSE_SECONDS;
		const id = setInterval(() => {
			if (closingIn === null) {
				clearInterval(id);
				return;
			}
			closingIn -= 1;
			if (closingIn <= 0) {
				clearInterval(id);
				closingIn = null;
				onClose();
			}
		}, 1000);
		return () => clearInterval(id);
	});
	/** Collapsed by default: the input is what the reader came for, and ten rows
	 *  above it would push the textarea off a phone screen. */
	let historyOpen = $state(false);

	function shortDate(ms: number): string {
		const d = new Date(ms);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	/**
	 * Null until the reader actually types. Any card tap now opens this panel,
	 * so a stray tap while scrolling would otherwise start a clock on a check
	 * nobody began — and 첫 시작 난이도 would already be spoiled by the time
	 * they noticed the panel was open.
	 */
	let startedAt = $state<number | null>(null);

	$effect(() => {
		const id = setInterval(() => {
			if (startedAt !== null && !confirming) elapsedMs = Date.now() - startedAt;
		}, 250);
		return () => clearInterval(id);
	});

	// The first character is what starts the check.
	$effect(() => {
		if (startedAt === null && typed.length > 0) startedAt = Date.now();
	});

	// Stop the start clock the first time the opening is correct. Watching the
	// text rather than keystrokes means a correction that finally gets the
	// opening right still counts, at the later time it became right.
	$effect(() => {
		if (startedAt !== null && openingAtMs === null && hasTypedOpening(verse, typed)) {
			openingAtMs = Date.now() - startedAt;
		}
	});

	/** The verse, marking the words the attempt did not produce. */
	const mismatches = $derived(markMismatchedWords(verse, typed));
	/** The attempt, marking the reader's own wrong words — and only their own.
	 *  A word they skipped is the 원문 block's to mark, right above this one. */
	const attemptMarks = $derived(markAttemptWords(verse, typed));

	// ─── 힌트: the next word, one character at a time ────────────────────────
	/** Where the attempt stopped matching. -1 once the verse is complete. */
	const stuckIndex = $derived(mismatches.findIndex((m) => !m.ok));
	/** Presses spent on the current stuck word. */
	let hintPresses = $state(0);
	/** The word those presses were spent on. */
	let hintAnchor = $state(-1);
	/** Presses across the whole check, for the history row. Never reset by
	 *  moving on to the next word — "I needed six nudges" is the useful number,
	 *  and it is the one the next check wants to compare against. */
	let hintsUsed = $state(0);

	// Typing past the stuck word starts the next one over from one character.
	// Without this the credit spent on 가르쳐서 would carry straight into
	// 마땅히 and hand over most of it unasked.
	$effect(() => {
		if (stuckIndex !== hintAnchor) {
			hintAnchor = stuckIndex;
			hintPresses = 0;
		}
	});

	const hint = $derived<Hint | null>(hintPresses > 0 ? nextHint(verse, typed, hintPresses) : null);

	/** `가□□□` — what is open, and how much is still behind it. */
	function masked(h: Hint): string {
		return h.revealed + '□'.repeat(Math.max(0, h.word.length - h.revealed.length));
	}

	function revealHint() {
		hintPresses += 1;
		hintsUsed += 1;
	}

	// ─── 말하기: dictation into the box, never into the grader ────────────────
	/** Decided once. Firefox ships no implementation, and a control that is
	 *  present but always fails is worse than one that was never offered. */
	const speechSupported = isSpeechSupported();
	let listening = $state(false);
	let speechError = $state<string | null>(null);
	let session: SpeechSession | null = null;
	/** What was in the box when the mic opened. Speech is appended to it, so a
	 *  reader can type the part they are sure of and say the rest. */
	let spokenBase = '';

	function toggleSpeech() {
		if (listening) {
			// Leave the listening state here rather than waiting to be told. On
			// iOS the recognizer's onend may never arrive, and when the only way
			// back was that callback the button stayed on 중지 and the panel read
			// as frozen.
			listening = false;
			session?.stop();
			session = null;
			return;
		}
		speechError = null;
		spokenBase = typed;
		// The software keyboard is up — the box is focused on open — and it has
		// no business covering half the screen while the reader is speaking.
		inputEl?.blur();
		// Opening the mic IS beginning the attempt, unlike a stray card tap — so
		// unlike the panel opening, this does start the clock.
		if (startedAt === null) startedAt = Date.now();
		session = startSpeech({
			onText: (text) => (typed = joinSpoken(spokenBase, text)),
			onEnd: () => {
				listening = false;
				session = null;
			},
			onError: (message) => (speechError = message)
		});
		listening = session !== null;
	}

	// Recognition holds the microphone open, so it has to be released when the
	// panel goes away or the attempt is submitted — not left running behind a
	// success screen.
	$effect(() => () => session?.stop());

	/** The pace bands as elapsed times, so the bar is scaled by the same
	 *  thresholds that decide the rating. */
	const scale = $derived(paceScale(normalizeForGrading(verse).length));
	/** How far along the scale the clock has run, capped so a long attempt
	 *  stops at full rather than overflowing the track. */
	const pacePct = $derived(
		scale.totalMs > 0 ? Math.min(100, (elapsedMs / scale.totalMs) * 100) : 0
	);
	/** Which band the attempt is in right now: 0 fast, 1 middling, 2 past the
	 *  last threshold. Counting marks already passed avoids restating the band
	 *  boundaries a second time. */
	const paceBand = $derived(scale.marks.filter((m) => elapsedMs > m).length);
	const PACE_STYLE = [
		{ label: '빠름', color: 'var(--color-ribbon-green)' },
		{ label: '보통', color: 'var(--color-ribbon-amber)' },
		{ label: '느림', color: 'var(--color-ribbon-red)' }
	];

	function mmss(ms: number): string {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	/** Where this attempt went wrong, as positions in the verse. Read off the
	 *  same marking the panel already paints, so the stored history and the
	 *  screen can never disagree about one attempt. */
	function missedIndices(): number[] {
		return mismatches.flatMap((m, i) => (m.ok ? [] : [i]));
	}

	/** Enter submits, unless it is committing a Korean syllable or carrying a
	 *  Shift — see submitsOnEnter, which the quiz's round shares. */
	function onKeydown(e: KeyboardEvent) {
		if (!submitsOnEnter(e)) return;
		e.preventDefault();
		if (typed.trim().length > 0) submit();
	}

	function submit() {
		session?.stop();
		const accuracy = accuracyOf(verse, typed);
		// Set before grading, so the attempt in hand is judged by the same rule as
		// every attempt after it.
		if (accuracy < 1) missedInSession = true;
		const result = {
			start:
				openingAtMs === null
					? null
					: startDifficultyFor(openingAtMs, { previous: priorStart, missedInSession }),
			// Pace is measured against the verse's own length, so a long verse is
			// not marked down for taking longer to type.
			full: fullDifficultyFrom(accuracy, normalizeForGrading(verse).length, elapsedMs, {
				previous: priorFull,
				// A hint read off the screen, or the verse heard a moment before,
				// makes this a test of recognition rather than recall.
				assisted: hintsUsed > 0 || heardAloud,
				missedInSession
			})
		};
		gradedFull = result.full;
		if (accuracy === 1) {
			commit(result);
			celebrate = true;
			saved = result;
			onGraded({ ...result, accuracy, elapsedMs, hints: hintsUsed, missed: missedIndices(), typed });
			return;
		}
		// Anything short of perfect goes through the reader — the app may
		// declare success on its own, but not that a flawed attempt was easy.
		proposed = result;
		confirming = true;
	}

	/**
	 * 포기: reveals the verse and hands the rating over untouched.
	 *
	 * No automatic level, deliberately. A reader who blanked on one word and a
	 * reader who knew none of it both press this button, and flattening them
	 * into one score would destroy the only signal the next check has to read.
	 * The elapsed time and whatever was typed are still recorded, so the
	 * history keeps the shape of the attempt.
	 */
	function giveUp() {
		session?.stop();
		// No rating of our own, but the session still knows it went wrong: a
		// verse abandoned and then retried off the revealed answer is not one
		// the reader produced from memory.
		missedInSession = true;
		proposed = { start: null, full: null };
		gaveUp = true;
		confirming = true;
	}

	function save() {
		if (proposed) {
			commit(proposed);
			saved = proposed;
			onGraded({
				...proposed,
				accuracy: accuracyOf(verse, typed),
				elapsedMs,
				hints: hintsUsed,
				missed: missedIndices(),
				typed
			});
		}
		confirming = false;
		gaveUp = false;
	}

	/** Writes a freshly graded result. A null is withheld rather than written
	 *  through: it means nothing was measured — the opening was never typed, or
	 *  the reader gave up without picking — not that an existing rating should
	 *  be erased. */
	function commit(r: { start: DifficultyLevel | null; full: DifficultyLevel | null }) {
		if (r.start !== null) onPickStart(r.start);
		if (r.full !== null) onPickFull(r.full);
	}

	/**
	 * Discards the attempt entirely and re-arms the panel for a fresh one.
	 *
	 * An earlier version kept the text and the clocks, on the theory that a
	 * flawed attempt is usually one wrong word worth editing. In use it read as
	 * a stuck panel — the reader who rejects a grade wants another go, not an
	 * edit of the try they just rejected. Keeping the clock was worse still: a
	 * resubmit made after reading the marked answer would have been timed from
	 * the original open, flattering it against an honest single attempt.
	 *
	 * `missedInSession` survives on purpose, and for that same reason — see its
	 * declaration.
	 */
	function cancel() {
		confirming = false;
		gaveUp = false;
		proposed = null;
		restart();
	}

	/** Re-writes the result with one dimension changed. The pickers are live —
	 *  a change lands immediately, the same as tapping a badge on the card. */
	function adjust(patch: { start?: DifficultyLevel | null; full?: DifficultyLevel | null }) {
		if (!saved) return;
		cancelAutoClose();
		saved = { ...saved, ...patch };
		// Here a null IS the reader's choice, so it is written through — unlike
		// the withheld null in commit().
		if ('start' in patch) onPickStart(patch.start ?? null);
		if ('full' in patch) onPickFull(patch.full ?? null);
	}

	/** Clears the box and both clocks for a fresh attempt. Reached from 다시 on
	 *  either screen — after a save, or after rejecting a flawed grade. Carrying
	 *  the previous elapsed time into the next attempt would misreport it, and
	 *  a resubmit made after reading the marked answer would flatter itself
	 *  against an honest single try. */
	function restart() {
		onRestart?.();
		celebrate = false;
		session?.stop();
		speechError = null;
		saved = null;
		typed = '';
		openingAtMs = null;
		startedAt = null;
		elapsedMs = 0;
		hintPresses = 0;
		hintsUsed = 0;
	}

	let panelEl: HTMLDivElement | undefined = $state();

	/**
	 * The verse the celebration belongs to.
	 *
	 * Walked up from the panel rather than passed down from VerseCard: the card
	 * already owns this panel's whole lifecycle, and threading an element
	 * through for decoration would put a prop on every other caller too. The
	 * panel itself is the fallback, which is the right shape even when the
	 * card's testid eventually changes.
	 */
	function burstOrigin(): HTMLElement | null {
		return panelEl?.closest<HTMLElement>('[data-testid="verse-row"]') ?? panelEl ?? null;
	}
</script>

<Confetti fire={celebrate} origin={burstOrigin()} />

<div
	bind:this={panelEl}
	class="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-3"
>
	{#if saved}
		<!-- The result has been written. Retiring the input matters as much as
		     showing the levels: leaving 제출 on screen after a successful save
		     reads as "nothing happened", which is exactly how this shipped. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			data-testid="memorize-success"
			class="flex items-center gap-3"
			onpointerdown={cancelAutoClose}
			onkeydown={cancelAutoClose}
		>
			<div>
				<p class="text-[calc(13px*var(--vfs))] font-semibold text-[var(--color-text)]">
					{saved.full === 5 ? '완벽합니다' : '저장했습니다'}
				</p>
				<p class="mt-0.5 text-[calc(12px*var(--vfs))] text-[var(--color-text-secondary)]">
					{saved.start === null ? '시작 —' : `시작 ${DIFFICULTY_LABELS[saved.start]}`}
					· {saved.full === null ? '전체 —' : `전체 ${DIFFICULTY_LABELS[saved.full]}`}
				</p>
			</div>
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					onclick={restart}
					class="rounded-full px-3 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
				>
					다시
				</button>
				{#if closingIn !== null}
					<span
						data-testid="auto-close"
						aria-hidden="true"
						class="text-[calc(12px*var(--vfs))] tabular-nums text-[var(--color-text-tertiary)]"
					>
						{closingIn}
					</span>
				{/if}
				<button
					type="button"
					onclick={onClose}
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-white transition-opacity hover:opacity-90"
				>
					닫기
				</button>
			</div>
		</div>
		<!-- Keep or apply, when the check moved the 전체 rating off what the verse
		     already carried.

		     Both choices write immediately and either can be pressed again, so
		     there is nothing to lose to the auto-close and no order to get
		     right. The graded value is applied on submit as before — this says
		     which one is in effect and offers the other, rather than holding the
		     result hostage to a decision. -->
		{#if priorFull !== null && priorFull !== gradedFull && gradedFull !== null}
			<div class="mt-3 flex flex-wrap items-center gap-1.5">
				<span class="text-[calc(11px*var(--vfs))] text-[var(--color-text-tertiary)]">난이도</span>
				<button
					type="button"
					aria-pressed={saved.full === priorFull}
					onclick={() => adjust({ full: priorFull })}
					class="rounded-full border px-2.5 py-1 text-[calc(11px*var(--vfs))] font-medium transition-colors {saved.full ===
					priorFull
						? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
						: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-card)]'}"
				>
					유지 {DIFFICULTY_LABELS[priorFull]}
				</button>
				<button
					type="button"
					aria-pressed={saved.full === gradedFull}
					onclick={() => adjust({ full: gradedFull })}
					class="rounded-full border px-2.5 py-1 text-[calc(11px*var(--vfs))] font-medium transition-colors {saved.full ===
					gradedFull
						? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
						: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-card)]'}"
				>
					반영 {DIFFICULTY_LABELS[gradedFull]}
				</button>
			</div>
		{/if}

		<!-- Editable, not just reported: the proposal is a guess, and a reader who
		     disagrees should not have to redo the attempt to change it. Same
		     pickers as the confirm panel, so one control means one thing. -->
		<div class="mt-3 flex items-center gap-3">
			<DifficultyBadge
				value={saved.start}
				label="첫 시작 난이도"
				onpick={(l) => adjust({ start: l })}
			/>
			<DifficultyBadge
				value={saved.full}
				label="전체 암송 난이도"
				onpick={(l) => adjust({ full: l })}
			/>
		</div>
	{:else if !confirming}
		<!-- The box comes first. It is the only thing on this panel the reader has
		     to act on, and it is now focused on open, so anything above it would
		     sit between them and a cursor that is already blinking. -->
		<textarea
			bind:this={inputEl}
			bind:value={typed}
			rows="3"
			aria-label="암송 구절 입력"
			onkeydown={onKeydown}
			placeholder="외운 구절을 입력하세요"
			class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-[calc(14px*var(--vfs))] text-[var(--color-text)] [--field-size:calc(14px*var(--vfs))]"
		></textarea>

		<!-- The clock, as a bar rather than a number alone. The track is the pace
		     scale the rating actually uses, so the fill answers the question a
		     bare stopwatch cannot: not "how long has it been" but "how am I doing".
		     Ticks sit where a band ends. -->
		<div
			class="relative mt-2 h-8 overflow-hidden rounded-lg bg-[var(--color-card)]"
			role="timer"
			aria-label="경과 시간"
		>
			<!-- No width transition on purpose. The clock ticks every 250ms, so a
			     300ms transition is restarted before it can finish and the fill
			     trails the number beside it; in a throttled background tab it never
			     advanced past zero at all, leaving an empty track under a running
			     clock. The step per tick is under 3px, which needs no easing. -->
			<div
				class="absolute inset-y-0 left-0"
				style="width: {pacePct}%; background-color: {PACE_STYLE[paceBand].color}; opacity: 0.22;"
			></div>
			{#each scale.marks.slice(0, -1) as m (m)}
				<span
					class="absolute inset-y-1 w-px bg-[var(--color-border)]"
					style="left: {(m / scale.totalMs) * 100}%"
					aria-hidden="true"
				></span>
			{/each}
			<div class="absolute inset-0 flex items-center justify-between px-3">
				<span
					data-testid="elapsed"
					class="text-[calc(13px*var(--vfs))] font-semibold tabular-nums text-[var(--color-text)]"
				>
					{mmss(elapsedMs)}
				</span>
				<span class="flex items-center gap-2 text-[calc(11px*var(--vfs))] text-[var(--color-text-secondary)]">
					{#if openingAtMs !== null}
						<span class="tabular-nums">도입부 {mmss(openingAtMs)}</span>
					{/if}
					<span style="color: {PACE_STYLE[paceBand].color}" class="font-semibold">
						{PACE_STYLE[paceBand].label}
					</span>
				</span>
			</div>
		</div>

		{#if history.length > 0}
			<div class="mt-2 text-[calc(11px*var(--vfs))]">
				<button
					type="button"
					onclick={() => (historyOpen = !historyOpen)}
					aria-expanded={historyOpen}
					class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
				>
					지난 점검 {history.length}회 · 최근 {history[0].start ?? '—'}·{history[0].full ?? '—'}
					<span aria-hidden="true">{historyOpen ? '▴' : '▾'}</span>
				</button>
				{#if historyOpen}
					<ul data-testid="check-history" class="mt-1 space-y-0.5">
						{#each history as h (h.id)}
							<li class="flex items-center justify-between gap-3 text-[var(--color-text-secondary)]">
								<span class="tabular-nums">{shortDate(h.checkedAt)}</span>
								<span class="tabular-nums">
									시작 {h.start ?? '—'} · 전체 {h.full ?? '—'}
									<!-- A 5 reached with eight nudges is not the same 5 as one
									     reached cold, and only this column can say so. -->
									{#if h.hints}<span class="text-[var(--color-text-tertiary)]"
											>· 힌트 {h.hints}</span
										>{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		<!-- The row is always here, empty or not. 힌트 is pressed repeatedly, and
		     a line that appears on the first press would shove the button out
		     from under the finger already on it. -->
		<div class="mt-2 min-h-[1.35rem]">
			{#if hint}
				<p data-testid="hint" class="text-[calc(13px*var(--vfs))] text-[var(--color-text-secondary)]">
					다음: <span class="font-semibold tracking-[0.08em] text-[var(--color-text)]"
						>{masked(hint)}</span
					>
				</p>
			{/if}
		</div>
		{#if speechError}
			<p class="mt-2 text-[calc(12px*var(--vfs))] text-[var(--color-danger)]">{speechError}</p>
		{/if}
		<div class="mt-2 flex items-center gap-1.5">
			{#if speechSupported}
				<!-- Dictation writes into the box, not into the grader. Recognition is
				     trained on modern Korean and this corpus is 개역한글, so a clean
				     recitation comes back misheard often enough that scoring it
				     directly would mark a reader down for the recognizer's mistakes.
				     Here they can see the mishearing and fix it. -->
				<button
					type="button"
					onclick={toggleSpeech}
					aria-pressed={listening}
					class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[calc(12px*var(--vfs))] font-medium transition-colors {listening
						? 'border-transparent bg-[var(--color-danger)] text-white'
						: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-card)]'}"
				>
					{#if listening}
						<Square size={12} strokeWidth={2.5} fill="currentColor" />
						중지
					{:else}
						<Mic size={13} strokeWidth={2} />
						말하기
					{/if}
				</button>
			{/if}
			<button
				type="button"
				disabled={stuckIndex === -1}
				onclick={revealHint}
				class="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)] disabled:opacity-40"
			>
				힌트
			</button>
			<button
				type="button"
				onclick={giveUp}
				class="rounded-full px-3 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text-secondary)]"
			>
				포기
			</button>
			<button
				type="button"
				disabled={typed.trim().length === 0}
				onclick={submit}
				class="ml-auto rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				제출
			</button>
		</div>
	{:else}
		<p class="text-[calc(12px*var(--vfs))] text-[var(--color-text-secondary)]">
			{gaveUp
				? '원문을 확인하고 직접 느낀 난이도를 저장해주세요.'
				: '틀린 곳이 있었습니다. 직접 느낀 난이도를 저장해주세요.'}
		</p>

		<!-- The verse leads. It is what the reader came to learn, and the attempt
		     below is what to hold against it — showing their own wording first
		     put it where the eye reads the text itself. Size and weight alone
		     still ran the two together, so the verse also gets a surface of its
		     own: raised off the panel, it cannot be misread as what they wrote. -->
		<p class="mt-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
			원문
		</p>
		<div
			data-testid="original-block"
			class="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5"
		>
			<p
				data-testid="mismatched-words"
				class="text-[calc(19px*var(--vfs))] font-bold leading-[1.7] break-keep"
			>
				{#each mismatches as m, i (i)}<span
						data-ok={m.ok}
						class={m.ok
							? 'text-[var(--color-text)]'
							: 'rounded bg-[var(--color-ribbon-green)]/25 px-0.5 text-[var(--color-text)]'}
						>{m.word}</span
					>{' '}{/each}
			</p>
		</div>

		<!-- Skipped when 포기 came before a single word — an empty block would
		     only claim they wrote nothing worth showing. Italic and left on the
		     bare panel: the reader's own hand, not the text. -->
		{#if typed.trim().length > 0}
			<p class="mt-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
				입력한 내용
			</p>
			<p
				data-testid="attempt-words"
				class="mt-1 text-[calc(14px*var(--vfs))] leading-[1.7] italic"
			>
				{#each attemptMarks as m, i (i)}<span
						data-ok={m.ok}
						class={m.ok
							? 'text-[var(--color-text)]'
							: 'rounded bg-[var(--color-ribbon-red)]/20 px-0.5 text-[var(--color-danger)]'}
						>{m.word}</span
					>{' '}{/each}
			</p>
		{/if}
		<div class="mt-3 flex items-center gap-3">
			<DifficultyBadge
				value={proposed?.start ?? null}
				label="첫 시작 난이도"
				onpick={(l) => proposed && (proposed = { ...proposed, start: l })}
			/>
			<DifficultyBadge
				value={proposed?.full ?? null}
				label="전체 암송 난이도"
				onpick={(l) => proposed && (proposed = { ...proposed, full: l })}
			/>
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					onclick={cancel}
					class="rounded-full px-3 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
				>
					다시
				</button>
				<!-- 전체 난이도 is what this screen exists to capture, so saving
				     without one would write an empty check. After 제출 it is always
				     set; after 포기 it is the reader's to supply. -->
				<button
					type="button"
					disabled={!proposed || proposed.full === null}
					onclick={save}
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[calc(12px*var(--vfs))] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					저장
				</button>
			</div>
		</div>
	{/if}
</div>
