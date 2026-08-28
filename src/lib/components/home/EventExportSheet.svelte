<script module lang="ts">
	/** Outcome of a Google Sheets export, rendered in place rather than as a
	 *  toast: the reader is looking at this dialog, and a success carries a
	 *  link they have to be able to reach. Declared in the module script
	 *  because that is the only scope a Svelte component can export a type
	 *  from — the parent owns this state and needs the shape. */
	export interface SheetNotice {
		text: string;
		/** Set on success — the document to open. */
		href?: string | null;
		/** Set when the fix is elsewhere in the app (connect Drive in 설정). */
		settings?: boolean;
		tone: 'ok' | 'error';
	}
</script>

<script lang="ts">
	import type { ExportOptions, ExportSort } from '$lib/export/eventWorkbook';
	import GoogleSheetsIcon from '$lib/components/icons/GoogleSheetsIcon.svelte';
	import ExcelIcon from '$lib/components/icons/ExcelIcon.svelte';

	interface Props {
		eventTitle: string;
		busy: boolean;
		sheetBusy: boolean;
		sheetNotice: SheetNotice | null;
		onConfirm: (options: ExportOptions) => void;
		onSheets: (options: ExportOptions) => void;
		onCancel: () => void;
	}
	let { eventTitle, busy, sheetBusy, sheetNotice, onConfirm, onSheets, onCancel }: Props =
		$props();

	// Difficulty is the reason the export exists. Scripture order is the
	// default because a printed list is easier to work through that way — the
	// app's own order exists to match the printed 구절집, which the file is not.
	let includeDifficulty = $state(true);
	// On by default: 구분 · 번호 · 제목 are how a verse is found again in the
	// printed 구절집, and the sheet is usually read next to it. Off is for the
	// one case they get in the way — printing the scripture on its own.
	let includeCatalog = $state(true);
	let sort = $state<ExportSort>('scripture');

	const SORTS: { id: ExportSort; label: string }[] = [
		{ id: 'scripture', label: '장절 순' },
		{ id: 'difficulty', label: '어려운 순' },
		{ id: 'booklet', label: '구절집 순' }
	];

	const options = $derived({ includeDifficulty, includeCatalog, sort });
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
		aria-label="{eventTitle} 내보내기"
	>
		<h2 class="text-[15px] font-semibold text-[var(--color-text)]">내보내기</h2>
		<p class="mt-1 text-[12px] text-[var(--color-text-secondary)]">{eventTitle}</p>

		<label class="mt-4 flex items-center gap-2.5 text-[14px] text-[var(--color-text)]">
			<input
				type="checkbox"
				bind:checked={includeDifficulty}
				class="h-4 w-4 accent-[var(--color-accent)]"
			/>
			난이도 열 포함 (시작 · 전체)
		</label>
		<!-- Tighter to the checkbox above than that one is to the title: the two
		     answer one question — which columns — and the 정렬 group below is a
		     different one. Both can be off; 장절 · 본문 are not offered as a
		     choice, so the sheet always carries the verse. -->
		<label class="mt-2 flex items-center gap-2.5 text-[14px] text-[var(--color-text)]">
			<input
				type="checkbox"
				bind:checked={includeCatalog}
				class="h-4 w-4 accent-[var(--color-accent)]"
			/>
			구분 · 번호 · 제목 열 포함
		</label>
		<!-- Three orders, so a radiogroup rather than the checkbox this was when
		     there were two. Each one is a whole answer to "what order", which a
		     checkbox stops being able to express the moment a third appears. -->
		<div class="mt-3">
			<p class="text-[12px] text-[var(--color-text-secondary)]">정렬</p>
			<div role="radiogroup" aria-label="정렬" class="mt-1.5 flex flex-wrap gap-1.5">
				{#each SORTS as option (option.id)}
					<button
						type="button"
						role="radio"
						aria-checked={sort === option.id}
						onclick={() => (sort = option.id)}
						class="rounded-full border px-3 py-1 text-[12px] font-medium transition-colors {sort ===
						option.id
							? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
							: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'}"
					>
						{option.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- aria-live so the outcome is announced: the export finishes long after
		     the tap, and nothing else moves focus. -->
		<p
			aria-live="polite"
			class="mt-3 min-h-[1.15rem] text-[12px] {sheetNotice?.tone === 'error'
				? 'text-[var(--color-danger)]'
				: 'text-[var(--color-text-secondary)]'}"
		>
			{#if sheetNotice}
				{sheetNotice.text}
				{#if sheetNotice.href}
					<a
						href={sheetNotice.href}
						target="_blank"
						rel="noopener noreferrer"
						class="ml-1 font-semibold text-[var(--color-accent)] underline underline-offset-2"
					>
						열기
					</a>
				{:else if sheetNotice.settings}
					<a
						href="/settings"
						class="ml-1 font-semibold text-[var(--color-accent)] underline underline-offset-2"
					>
						설정으로
					</a>
				{/if}
			{/if}
		</p>

		<div class="mt-3 flex flex-wrap items-center justify-end gap-2">
			<button
				type="button"
				onclick={onCancel}
				class="rounded-full px-4 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				취소
			</button>
			<button
				type="button"
				disabled={sheetBusy}
				aria-label="Google Sheets"
				aria-busy={sheetBusy}
				onclick={() => onSheets(options)}
				class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)] disabled:opacity-50"
			>
				<GoogleSheetsIcon size={15} />
				{sheetBusy ? '보내는 중…' : 'Google Sheets'}
			</button>
			<!-- The accessible name matches the visible one. It is a static label
			     because the visible text becomes 만드는 중… while the file is
			     building, and a name that changes mid-press leaves a screen
			     reader announcing a different button than the one that was
			     activated — aria-busy carries the progress instead. -->
			<button
				type="button"
				disabled={busy}
				aria-label="엑셀 다운로드"
				aria-busy={busy}
				onclick={() => onConfirm(options)}
				class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				<ExcelIcon size={15} />
				{busy ? '만드는 중…' : '엑셀 다운로드'}
			</button>
		</div>
	</div>
</div>
