<script lang="ts">
	import DifficultyBadge from './DifficultyBadge.svelte';
	import type { CheckRecord } from '$lib/db/local';
	import { DIFFICULTY_LABELS, type DifficultyLevel } from '$lib/db/verseRatings';
	import {
		accuracyOf,
		fullDifficultyFrom,
		markMismatchedWords,
		nextHint,
		normalizeForGrading,
		type Hint
	} from '$lib/memorize/grade';
	import { hasTypedOpening, startDifficultyFor } from '$lib/memorize/timing';

	interface Props {
		verse: string;
		/** Past checks, newest first. Empty until the verse has been checked. */
		history?: CheckRecord[];
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
		}) => void;
		/** 닫기: leave memorize mode and return to the ordinary card. */
		onClose: () => void;
	}
	let { verse, history = [], onPickStart, onPickFull, onGraded, onClose }: Props = $props();

	let typed = $state('');
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
	/** The attempt, marking the reader's own wrong words. Same function with
	 *  the arguments swapped: walking the attempt and checking each word
	 *  against the verse is exactly the mirror of walking the verse. */
	const attemptMarks = $derived(markMismatchedWords(typed, verse));

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

	function mmss(ms: number): string {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	/**
	 * Enter submits. Shift+Enter keeps the newline, and a composing Enter is
	 * ignored: Korean input uses Enter to commit a syllable, so submitting on
	 * that keystroke would fire while the reader was mid-word.
	 */
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		e.preventDefault();
		if (typed.trim().length > 0) submit();
	}

	function submit() {
		const accuracy = accuracyOf(verse, typed);
		const result = {
			start: openingAtMs === null ? null : startDifficultyFor(openingAtMs),
			// Pace is measured against the verse's own length, so a long verse is
			// not marked down for taking longer to type.
			full: fullDifficultyFrom(accuracy, normalizeForGrading(verse).length, elapsedMs)
		};
		if (accuracy === 1) {
			commit(result);
			saved = result;
			onGraded({ ...result, accuracy, elapsedMs, hints: hintsUsed });
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
				hints: hintsUsed
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
		saved = { ...saved, ...patch };
		// Here a null IS the reader's choice, so it is written through — unlike
		// the withheld null in commit().
		if ('start' in patch) onPickStart(patch.start ?? null);
		if ('full' in patch) onPickFull(patch.full ?? null);
	}

	/** Fresh attempt from the success screen. Unlike 취소 this DOES reset the
	 *  text and both clocks: the previous attempt is finished and recorded, so
	 *  carrying its elapsed time into the next one would misreport it. */
	function restart() {
		saved = null;
		typed = '';
		openingAtMs = null;
		startedAt = null;
		elapsedMs = 0;
		hintPresses = 0;
		hintsUsed = 0;
	}
</script>

<div class="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-3">
	{#if saved}
		<!-- The result has been written. Retiring the input matters as much as
		     showing the levels: leaving 제출 on screen after a successful save
		     reads as "nothing happened", which is exactly how this shipped. -->
		<div data-testid="memorize-success" class="flex items-center gap-3">
			<div>
				<p class="text-[13px] font-semibold text-[var(--color-text)]">
					{saved.full === 5 ? '완벽합니다' : '저장했습니다'}
				</p>
				<p class="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">
					{saved.start === null ? '시작 —' : `시작 ${DIFFICULTY_LABELS[saved.start]}`}
					· {saved.full === null ? '전체 —' : `전체 ${DIFFICULTY_LABELS[saved.full]}`}
				</p>
			</div>
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					onclick={restart}
					class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
				>
					다시
				</button>
				<button
					type="button"
					onclick={onClose}
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
				>
					닫기
				</button>
			</div>
		</div>
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
		<div class="mb-2 flex items-center justify-between gap-2 text-[11px]">
			<span data-testid="elapsed" class="tabular-nums text-[var(--color-text-secondary)]"
				>⏱ {mmss(elapsedMs)}</span
			>
			{#if openingAtMs !== null}
				<span class="text-[var(--color-text-tertiary)]">도입부 {mmss(openingAtMs)}</span>
			{/if}
			{#if history.length > 0}
				<button
					type="button"
					onclick={() => (historyOpen = !historyOpen)}
					aria-expanded={historyOpen}
					class="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
				>
					지난 점검 {history.length}회 · 최근 {history[0].start ?? '—'}·{history[0].full ?? '—'}
					<span aria-hidden="true">{historyOpen ? '▴' : '▾'}</span>
				</button>
			{/if}
		</div>
		{#if historyOpen}
			<ul data-testid="check-history" class="mb-2 space-y-0.5 text-[11px]">
				{#each history as h (h.id)}
					<li class="flex items-center justify-between gap-3 text-[var(--color-text-secondary)]">
						<span class="tabular-nums">{shortDate(h.checkedAt)}</span>
						<span class="tabular-nums">
							시작 {h.start ?? '—'} · 전체 {h.full ?? '—'}
							<!-- A 5 reached with eight nudges is not the same 5 as one
							     reached cold, and only this column can say so. -->
							{#if h.hints}<span class="text-[var(--color-text-tertiary)]">· 힌트 {h.hints}</span
								>{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		<textarea
			bind:value={typed}
			rows="3"
			aria-label="암송 구절 입력"
			onkeydown={onKeydown}
			placeholder="외운 구절을 입력하세요"
			class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-[14px] text-[var(--color-text)]"
		></textarea>
		<!-- The row is always here, empty or not. 힌트 is pressed repeatedly, and
		     a line that appears on the first press would shove the button out
		     from under the finger already on it. -->
		<div class="mt-2 min-h-[1.35rem]">
			{#if hint}
				<p data-testid="hint" class="text-[13px] text-[var(--color-text-secondary)]">
					다음: <span class="font-semibold tracking-[0.08em] text-[var(--color-text)]"
						>{masked(hint)}</span
					>
				</p>
			{/if}
		</div>
		<div class="mt-2 flex items-center gap-1.5">
			<button
				type="button"
				disabled={stuckIndex === -1}
				onclick={revealHint}
				class="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)] disabled:opacity-40"
			>
				힌트
			</button>
			<button
				type="button"
				onclick={giveUp}
				class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text-secondary)]"
			>
				포기
			</button>
			<button
				type="button"
				disabled={typed.trim().length === 0}
				onclick={submit}
				class="ml-auto rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				제출
			</button>
		</div>
	{:else}
		<p class="text-[12px] text-[var(--color-text-secondary)]">
			{gaveUp
				? '원문을 확인하고 직접 느낀 난이도를 저장해주세요.'
				: '틀린 곳이 있었습니다. 직접 느낀 난이도를 저장해주세요.'}
		</p>

		<!-- The attempt first: "how did I go wrong" is answered by the reader's
		     own words, and the verse below is what to compare them against.
		     Showing only the verse told them what it says and nothing about
		     what they wrote. Skipped when 포기 came before a single word — an
		     empty block would only claim they wrote nothing worth showing. -->
		{#if typed.trim().length > 0}
			<p class="mt-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
				입력한 내용
			</p>
			<p data-testid="attempt-words" class="mt-1 text-[14px] leading-[1.7]">
				{#each attemptMarks as m, i (i)}<span
						data-ok={m.ok}
						class={m.ok
							? 'text-[var(--color-text)]'
							: 'rounded bg-[var(--color-ribbon-red)]/20 px-0.5 text-[var(--color-danger)]'}
						>{m.word}</span
					>{' '}{/each}
			</p>
		{/if}

		<p class="mt-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
			원문
		</p>
		<p data-testid="mismatched-words" class="mt-1 text-[14px] leading-[1.7]">
			{#each mismatches as m, i (i)}<span
					data-ok={m.ok}
					class={m.ok
						? 'text-[var(--color-text)]'
						: 'rounded bg-[var(--color-ribbon-green)]/25 px-0.5 font-medium text-[var(--color-text)]'}
					>{m.word}</span
				>{' '}{/each}
		</p>
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
					class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
				>
					취소
				</button>
				<!-- 전체 난이도 is what this screen exists to capture, so saving
				     without one would write an empty check. After 제출 it is always
				     set; after 포기 it is the reader's to supply. -->
				<button
					type="button"
					disabled={!proposed || proposed.full === null}
					onclick={save}
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					저장
				</button>
			</div>
		</div>
	{/if}
</div>
