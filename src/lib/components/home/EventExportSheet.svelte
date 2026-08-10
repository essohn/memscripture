<script lang="ts">
	import type { ExportOptions } from '$lib/export/eventWorkbook';

	interface Props {
		eventTitle: string;
		busy: boolean;
		onConfirm: (options: ExportOptions) => void;
		onCancel: () => void;
	}
	let { eventTitle, busy, onConfirm, onCancel }: Props = $props();

	// Both on by default. Difficulty is the reason the export exists, and a
	// printed list is easier to work through in scripture order — the app's own
	// order exists to match the printed 구절집, which the file is not.
	let includeDifficulty = $state(true);
	let sortByScripture = $state(true);
</script>

<!-- z-[55]/z-[60], matching ConfirmDialog: the TabBar is fixed at z-50, and at
     an equal z-index DOM order decides — the bar renders after the page, so a
     z-50 sheet loses. That buried the confirm button under the bar, where
     elementFromPoint resolved to a TabBar link: the tap navigated away instead
     of downloading. A modal must sit above the nav, not tie with it.
     Bottom padding clears the iOS home indicator the same way the TabBar does. -->
<div
	class="fixed inset-0 z-[55] flex items-end justify-center bg-black/30 px-5"
	style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));"
>
	<button type="button" class="absolute inset-0" aria-label="닫기" onclick={onCancel}></button>
	<div
		class="relative z-[60] w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 shadow-lg"
		role="dialog"
		aria-label="{eventTitle} 엑셀 다운로드"
	>
		<h2 class="text-[15px] font-semibold text-[var(--color-text)]">엑셀로 다운로드</h2>
		<p class="mt-1 text-[12px] text-[var(--color-text-secondary)]">{eventTitle}</p>

		<label class="mt-4 flex items-center gap-2.5 text-[14px] text-[var(--color-text)]">
			<input
				type="checkbox"
				bind:checked={includeDifficulty}
				class="h-4 w-4 accent-[var(--color-accent)]"
			/>
			난이도 열 포함 (시작 · 전체)
		</label>
		<label class="mt-2.5 flex items-center gap-2.5 text-[14px] text-[var(--color-text)]">
			<input
				type="checkbox"
				bind:checked={sortByScripture}
				class="h-4 w-4 accent-[var(--color-accent)]"
			/>
			장절 순서로 정렬
		</label>

		<div class="mt-5 flex items-center justify-end gap-2">
			<button
				type="button"
				onclick={onCancel}
				class="rounded-full px-4 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				취소
			</button>
			<button
				type="button"
				disabled={busy}
				aria-label="다운로드"
				aria-busy={busy}
				onclick={() => onConfirm({ includeDifficulty, sortByScripture })}
				class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{busy ? '만드는 중…' : '다운로드'}
			</button>
		</div>
	</div>
</div>
