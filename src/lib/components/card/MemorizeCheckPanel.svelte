<script lang="ts">
	import DifficultyBadge from './DifficultyBadge.svelte';
	import { DIFFICULTY_LABELS, type DifficultyLevel } from '$lib/db/verseRatings';
	import { accuracyOf, fullDifficultyFor, markMismatchedWords } from '$lib/memorize/grade';
	import { hasTypedOpening, startDifficultyFor } from '$lib/memorize/timing';

	interface Props {
		verse: string;
		/** Per dimension rather than one combined result, so this component can
		 *  express the difference between "no start rating was measurable, leave
		 *  whatever is there" and "the reader cleared it". A single payload
		 *  cannot say both with one null. */
		onPickStart: (level: DifficultyLevel | null) => void;
		onPickFull: (level: DifficultyLevel | null) => void;
		/** Fired once a result is recorded, so the card can lift the curtain —
		 *  hiding the verse has no purpose after it has been graded. */
		onGraded: () => void;
		/** 닫기: leave memorize mode and return to the ordinary card. */
		onClose: () => void;
	}
	let { verse, onPickStart, onPickFull, onGraded, onClose }: Props = $props();

	let typed = $state('');
	let elapsedMs = $state(0);
	/** Set the moment the opening is first produced, then never revised — the
	 *  reading is "how long to recall the start", not "how long in total". */
	let openingAtMs = $state<number | null>(null);
	let confirming = $state(false);
	let proposed = $state<{ start: DifficultyLevel | null; full: DifficultyLevel } | null>(null);
	/** Set once the result is written, which swaps the input for a summary.
	 *  Without it a perfect attempt saved in silence and left the panel
	 *  untouched — the reader who recited it best got no reply at all. */
	let saved = $state<{ start: DifficultyLevel | null; full: DifficultyLevel | null } | null>(null);

	let startedAt = $state(Date.now());

	$effect(() => {
		const id = setInterval(() => {
			if (!confirming) elapsedMs = Date.now() - startedAt;
		}, 250);
		return () => clearInterval(id);
	});

	// Stop the start clock the first time the opening is correct. Watching the
	// text rather than keystrokes means a correction that finally gets the
	// opening right still counts, at the later time it became right.
	$effect(() => {
		if (openingAtMs === null && hasTypedOpening(verse, typed)) {
			openingAtMs = Date.now() - startedAt;
		}
	});

	/** The verse, marking the words the attempt did not produce. */
	const mismatches = $derived(markMismatchedWords(verse, typed));
	/** The attempt, marking the reader's own wrong words. Same function with
	 *  the arguments swapped: walking the attempt and checking each word
	 *  against the verse is exactly the mirror of walking the verse. */
	const attemptMarks = $derived(markMismatchedWords(typed, verse));

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
			full: fullDifficultyFor(accuracy)
		};
		if (accuracy === 1) {
			commit(result);
			saved = result;
			onGraded();
			return;
		}
		// Anything short of perfect goes through the reader — the app may
		// declare success on its own, but not that a flawed attempt was easy.
		proposed = result;
		confirming = true;
	}

	function save() {
		if (proposed) {
			commit(proposed);
			saved = proposed;
			onGraded();
		}
		confirming = false;
	}

	/** Writes a freshly graded result. A null start is withheld: it means the
	 *  opening was never typed, so there is nothing to say — not that the
	 *  reader wants an existing rating erased. */
	function commit(r: { start: DifficultyLevel | null; full: DifficultyLevel }) {
		if (r.start !== null) onPickStart(r.start);
		onPickFull(r.full);
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
		startedAt = Date.now();
		elapsedMs = 0;
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
		<div class="mb-2 flex items-center justify-between text-[11px]">
			<span class="tabular-nums text-[var(--color-text-secondary)]">⏱ {mmss(elapsedMs)}</span>
			{#if openingAtMs !== null}
				<span class="text-[var(--color-text-tertiary)]">도입부 {mmss(openingAtMs)}</span>
			{/if}
		</div>
		<textarea
			bind:value={typed}
			rows="3"
			aria-label="암송 구절 입력"
			onkeydown={onKeydown}
			placeholder="외운 구절을 입력하세요"
			class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-[14px] text-[var(--color-text)]"
		></textarea>
		<div class="mt-2 flex justify-end">
			<button
				type="button"
				disabled={typed.trim().length === 0}
				onclick={submit}
				class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				제출
			</button>
		</div>
	{:else}
		<p class="text-[12px] text-[var(--color-text-secondary)]">
			틀린 곳이 있어 자동으로 저장하지 않았습니다. 확인 후 저장해주세요.
		</p>

		<!-- The attempt first: "how did I go wrong" is answered by the reader's
		     own words, and the verse below is what to compare them against.
		     Showing only the verse told them what it says and nothing about
		     what they wrote. -->
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
				onpick={(l) => proposed && l !== null && (proposed = { ...proposed, full: l })}
			/>
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					onclick={cancel}
					class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
				>
					취소
				</button>
				<button
					type="button"
					onclick={save}
					class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
				>
					저장
				</button>
			</div>
		</div>
	{/if}
</div>
