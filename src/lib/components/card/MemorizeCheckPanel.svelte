<script lang="ts">
	import DifficultyBadge from './DifficultyBadge.svelte';
	import { DIFFICULTY_LABELS, type DifficultyLevel } from '$lib/db/verseRatings';
	import { accuracyOf, fullDifficultyFor, markMismatchedWords } from '$lib/memorize/grade';
	import { hasTypedOpening, startDifficultyFor } from '$lib/memorize/timing';

	interface Props {
		verse: string;
		onResult: (r: { start: DifficultyLevel | null; full: DifficultyLevel }) => void;
	}
	let { verse, onResult }: Props = $props();

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
	let saved = $state<{ start: DifficultyLevel | null; full: DifficultyLevel } | null>(null);

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

	const mismatches = $derived(markMismatchedWords(verse, typed));

	function mmss(ms: number): string {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	function submit() {
		const accuracy = accuracyOf(verse, typed);
		const result = {
			start: openingAtMs === null ? null : startDifficultyFor(openingAtMs),
			full: fullDifficultyFor(accuracy)
		};
		if (accuracy === 1) {
			onResult(result);
			saved = result;
			return;
		}
		// Anything short of perfect goes through the reader — the app may
		// declare success on its own, but not that a flawed attempt was easy.
		proposed = result;
		confirming = true;
	}

	function save() {
		if (proposed) {
			onResult(proposed);
			saved = proposed;
		}
		confirming = false;
	}

	/**
	 * Returns to the typing view without writing anything. Deliberately leaves
	 * `typed`, `openingAtMs` and `startedAt` untouched — only `confirming`
	 * flips back:
	 *  - Keeping `typed` lets the reader fix the one word that was wrong
	 *    without retyping the whole verse.
	 *  - Keeping `openingAtMs`/`startedAt` means the eventual accepted attempt
	 *    is timed from when the reader actually started, not from the moment
	 *    they backed out of a look at their mistakes — resetting the clock
	 *    here would let a second try appear faster than it really was.
	 * The spec's "취소 discards the attempt and writes nothing" describes the
	 * write, not this in-memory state.
	 */
	function cancel() {
		confirming = false;
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
					· 전체 {DIFFICULTY_LABELS[saved.full]}
				</p>
			</div>
			<button
				type="button"
				onclick={restart}
				class="ml-auto rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)]"
			>
				다시
			</button>
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
		<p data-testid="mismatched-words" class="mt-2 text-[14px] leading-[1.7]">
			{#each mismatches as m, i (i)}<span
					data-ok={m.ok}
					class={m.ok
						? 'text-[var(--color-text)]'
						: 'rounded bg-[var(--color-ribbon-red)]/20 px-0.5 text-[var(--color-danger)]'}
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
