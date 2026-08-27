<script lang="ts">
	import { Trash2, X } from 'lucide-svelte';
	import type { CheckRecord } from '$lib/db/local';
	import { DIFFICULTY_COLORS, type DifficultyLevel } from '$lib/db/verseRatings';
	import { relativeTimeKo, shortDateKo } from '$lib/utils/relativeTime';

	interface Props {
		/** The verse this history belongs to, for the sheet's own title. */
		heading: string;
		/** 점검 records, newest first. Quiz rounds are filtered out upstream —
		 *  they carry no difficulty, and this sheet is built to show one. */
		records: CheckRecord[];
		/** Injectable so the relative times can be asserted against a fixed
		 *  clock rather than against whenever the suite happens to run. */
		now?: number;
		/** Given, each row offers to delete itself. Omitted, the sheet is a
		 *  read-only report — the button is not drawn at all rather than drawn
		 *  and made to do nothing. */
		onDelete?: (record: CheckRecord) => void;
		/** Required in practice wherever onDelete is given: the undo is offered
		 *  in the row itself, and it has to reach the store that took the
		 *  deletion. */
		onRestore?: (record: CheckRecord) => void;
		onClose: () => void;
	}
	let { heading, records, now = Date.now(), onDelete, onRestore, onClose }: Props = $props();

	/**
	 * Rows removed in this sitting, by id.
	 *
	 * The deletion is already written by the time this fills — the caller does
	 * that — so this is only about what the list looks like while the sheet is
	 * open. The row keeps its place and turns into its own undo, rather than
	 * vanishing and reflowing the list under the finger that just tapped it.
	 *
	 * Read off a snapshot of the records taken once, not off the live prop: the
	 * caller drops the deleted record from its own state, which would take the
	 * row — and the undo with it — off the screen before it could be used. The
	 * sheet is modal and no check can land while it is open, so nothing else
	 * moves the list in the meantime.
	 */
	// svelte-ignore state_referenced_locally
	const rows = records;
	let removed = $state(new Set<string>());

	function remove(record: CheckRecord) {
		removed = new Set(removed).add(record.id);
		onDelete?.(record);
	}

	function undo(record: CheckRecord) {
		const next = new Set(removed);
		next.delete(record.id);
		removed = next;
		onRestore?.(record);
	}

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
	     inside the sheet rather than growing it past the screen. -->
	<ul class="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2">
		{#each rows as h (h.id)}
			<li
				data-testid="check-history-row"
				class="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"
			>
			{#if removed.has(h.id)}
				<!-- The row it replaces, at the height it had, so the list does not
				     jump while the reader decides whether they meant it. -->
				<div class="flex items-center justify-between gap-3">
					<span class="text-[12px] text-[var(--color-text-tertiary)]">
						{shortDateKo(h.checkedAt)} 점검 기록을 지웠습니다
					</span>
					<button
						type="button"
						onclick={() => undo(h)}
						class="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-elevated)]"
					>
						실행 취소
					</button>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span class="text-[12px] tabular-nums text-[var(--color-text-secondary)]"
						>{shortDateKo(h.checkedAt)}</span
					>
					<span class="text-[12px] text-[var(--color-text-tertiary)]"
						>{relativeTimeKo(h.checkedAt, now)}</span
					>
					<span class="ml-auto flex items-center gap-1.5">
						{@render level('첫 시작 난이도', h.start as DifficultyLevel | null)}
						{@render level('전체 암송 난이도', h.full as DifficultyLevel | null)}
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

				{#if onDelete}
					<!-- Named by date, not "삭제": ten identical labels is a list a
					     screen reader cannot tell apart, and this one is destructive.
					     No confirmation, because the undo is the confirmation — and it
					     costs one tap instead of two on every deliberate delete. -->
					<div class="mt-2 flex justify-end">
						<button
							type="button"
							onclick={() => remove(h)}
							aria-label="{shortDateKo(h.checkedAt)} 점검 기록 삭제"
							class="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-danger)]"
						>
							<Trash2 size={16} strokeWidth={1.75} />
						</button>
					</div>
				{/if}
			{/if}
			</li>
		{/each}
	</ul>
</div>

<!-- role="img" rather than a bare span: the colour and the digit together are
     the whole message, and a span's aria-label is not guaranteed to be read.
     Not a button — this is what the rating *was*, not a control to change it. -->
{#snippet level(label: string, value: DifficultyLevel | null)}
	<span
		role="img"
		aria-label="{label} {value ?? '없음'}"
		style={value === null
			? 'border: 1.5px dashed var(--color-border); color: var(--color-text-tertiary);'
			: `background-color: ${DIFFICULTY_COLORS[value]}; color: white;`}
		class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
	>
		{value ?? '—'}
	</span>
{/snippet}
