<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { CheckRecord } from '$lib/db/local';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import { relativeTimeKo, shortDateKo } from '$lib/utils/relativeTime';
	import DifficultyDot from './DifficultyDot.svelte';
	import CheckDiagnosis from './CheckDiagnosis.svelte';

	interface Props {
		/** The verse this history belongs to, for the sheet's own title. */
		heading: string;
		/** 점검 records, newest first. Quiz rounds are filtered out upstream —
		 *  they carry no difficulty, and this sheet is built to show one. */
		records: CheckRecord[];
		/** The verse's words, for the diagnosis heat map. Required rather than
		 *  defaulted: a caller who forgot it would ship a sheet with a silently
		 *  missing heat map, which is the hardest failure to notice in review. */
		words: string[];
		/** Injectable so the relative times can be asserted against a fixed
		 *  clock rather than against whenever the suite happens to run. */
		now?: number;
		onClose: () => void;
	}
	let { heading, records, words, now = Date.now(), onClose }: Props = $props();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-[55] bg-black/30"
	onclick={onClose}
	role="presentation"
	aria-hidden="true"
></div>

<div
	role="dialog"
	aria-modal="true"
	aria-labelledby="check-history-title"
	class="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[80vh] max-w-2xl flex-col rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 pt-5 shadow-2xl"
	style="padding-bottom: calc(env(safe-area-inset-bottom) + 16px);"
>
	<div class="mb-3 flex shrink-0 items-center justify-between gap-3">
		<h2
			id="check-history-title"
			class="min-w-0 flex-1 truncate text-[16px] font-semibold text-[var(--color-text)]"
		>
			{heading} 점검 기록
		</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="닫기"
			class="shrink-0 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
		>
			<X size={18} strokeWidth={1.75} />
		</button>
	</div>

	<!-- Ten rows of verse-length text do not fit a phone, so the list scrolls
	     inside the sheet rather than growing it past the screen. The diagnosis
	     scrolls with it: pinned, it would eat the rows it summarises. -->
	<div class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
		<CheckDiagnosis {records} {words} />
		<ul class="space-y-3">
			{#each records as h (h.id)}
				<li
					data-testid="check-history-row"
					class="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"
				>
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span class="text-[12px] tabular-nums text-[var(--color-text-secondary)]"
							>{shortDateKo(h.checkedAt)}</span
						>
						<span class="text-[12px] text-[var(--color-text-tertiary)]"
							>{relativeTimeKo(h.checkedAt, now)}</span
						>
						<span class="ml-auto flex items-center gap-1.5">
							<DifficultyDot label="첫 시작 난이도" value={h.start as DifficultyLevel | null} />
							<DifficultyDot label="전체 암송 난이도" value={h.full as DifficultyLevel | null} />
						</span>
					</div>

					<div
						class="mt-1.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums text-[var(--color-text-tertiary)]"
					>
						<span>정확도 {Math.round(h.accuracy * 100)}%</span>
						<!-- A 5 reached with eight nudges is not the same 5 as one reached
						     cold, and only this line can say so. Absent hints predate the
						     field and zero is a check that spent none — neither is worth
						     a "힌트 0" taking up the row. -->
						{#if h.hints}<span>· 힌트 {h.hints}</span>{/if}
					</div>

					<!-- The attempt, printed as it was written. Three states, not two:
					     text, an attempt saved with nothing in it, and a check from
					     before the field existed. Collapsing the last two would put
					     words in the mouth of every check the reader made last year. -->
					{#if h.typed}
						<p
							class="mt-2 whitespace-pre-line break-keep border-t border-[var(--color-border)] pt-2 text-[13px] leading-[1.55] text-[var(--color-text)]"
						>{h.typed}</p>
					{:else if h.typed === ''}
						<p class="mt-2 text-[12px] italic text-[var(--color-text-tertiary)]">
							입력한 내용 없이 저장했습니다
						</p>
					{:else}
						<p class="mt-2 text-[12px] italic text-[var(--color-text-tertiary)]">
							입력 본문이 기록되기 전의 점검입니다
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>
