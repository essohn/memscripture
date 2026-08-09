<script lang="ts">
	import type { ExportOptions } from '$lib/export/eventWorkbook';

	interface Props {
		eventTitle: string;
		busy: boolean;
		onConfirm: (options: ExportOptions) => void;
		onCancel: () => void;
	}
	let { eventTitle, busy, onConfirm, onCancel }: Props = $props();

	// Difficulty on by default: it is the reason the export exists. Scripture
	// sort off by default so the file opens in the same order as the app.
	let includeDifficulty = $state(true);
	let sortByScripture = $state(false);
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-5 pb-5">
	<button type="button" class="absolute inset-0" aria-label="닫기" onclick={onCancel}></button>
	<div
		class="relative w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 shadow-lg"
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
				onclick={() => onConfirm({ includeDifficulty, sortByScripture })}
				class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{busy ? '만드는 중…' : '다운로드'}
			</button>
		</div>
	</div>
</div>
