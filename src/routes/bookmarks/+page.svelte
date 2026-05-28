<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { setBookmark, clearBookmark, clearAllOfColor } from '$lib/db/bookmarks';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import { BOOKMARK_COLORS, type BookmarkColor } from '$lib/types';
	import type { BookmarksLoadData, BookmarkedRow } from './+page';

	let { data }: { data: BookmarksLoadData } = $props();

	let rows = $state<BookmarkedRow[]>(data.rows);
	let selected = $state<BookmarkColor>('red');
	let showVerseText = $state(true);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(
		null
	);

	$effect(() => {
		let active = true;
		(async () => {
			const v = await getShowVerseTextInList();
			if (active) showVerseText = v;
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}

	const COLOR_LABELS: Record<BookmarkColor, string> = {
		red: '빨강',
		amber: '주황',
		green: '초록',
		blue: '파랑',
		purple: '보라'
	};

	const countsByColor = $derived.by(() => {
		const counts = { red: 0, amber: 0, green: 0, blue: 0, purple: 0 } as Record<
			BookmarkColor,
			number
		>;
		for (const r of rows) counts[r.bookmark.color] += 1;
		return counts;
	});

	const visibleRows = $derived(rows.filter((r) => r.bookmark.color === selected));

	async function pickColor(row: BookmarkedRow, color: BookmarkColor) {
		// Rebuild the row so the $state array reactively notices the color change
		// (mutating row.bookmark.color in place wouldn't re-trigger derived counts).
		rows = rows.map((r) =>
			r.bookmark.id === row.bookmark.id
				? { ...r, bookmark: { ...r.bookmark, color } }
				: r
		);
		await setBookmark(row.bookmark.packageId, row.bookmark.verseNo, color).catch(() => {});
	}

	async function removeRow(row: BookmarkedRow) {
		const { packageId, verseNo } = row.bookmark;
		rows = rows.filter((r) => r.bookmark.id !== row.bookmark.id);
		await clearBookmark(packageId, verseNo).catch(() => {});
	}

	async function clearAllSelected() {
		const color = selected;
		const removed = rows.filter((r) => r.bookmark.color === color);
		if (removed.length === 0) return;

		// Optimistic: remove from UI + DB immediately, then offer undo via toast.
		// Closing the tab before tapping 실행 취소 finalizes the delete (DB already
		// matches the UI), which is the right tradeoff for a single-device PWA.
		rows = rows.filter((r) => r.bookmark.color !== color);
		await clearAllOfColor(color).catch(() => {});

		toast = {
			message: `${COLOR_LABELS[color]} 리본 ${removed.length}개를 지웠어요`,
			actionLabel: '실행 취소',
			onAction: async () => {
				// Re-insert each bookmark. createdAt is reset to "now" — minor loss
				// vs preserving original timestamps; rebuilds via the public API
				// rather than touching the Dexie schema for an undo edge case.
				rows = [...rows, ...removed];
				await Promise.all(
					removed.map((r) =>
						setBookmark(r.bookmark.packageId, r.bookmark.verseNo, r.bookmark.color).catch(
							() => {}
						)
					)
				);
			}
		};
	}
</script>

<Header title="북마크" />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div role="tablist" aria-label="리본 색상" class="mb-5 flex flex-wrap gap-2">
		{#each BOOKMARK_COLORS as c (c)}
			{@const active = selected === c}
			{@const count = countsByColor[c]}
			<button
				type="button"
				role="tab"
				aria-selected={active}
				onclick={() => (selected = c)}
				class="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all"
				class:border-transparent={!active}
				style={active
					? `background-color: var(--color-ribbon-${c}); color: white; border-color: var(--color-ribbon-${c});`
					: `background-color: var(--color-elevated); color: var(--color-text-secondary); border-color: var(--color-border);`}
			>
				<span
					class="inline-block h-2 w-2 rounded-full"
					style="background-color: {active ? 'white' : `var(--color-ribbon-${c})`};"
				></span>
				<span>{COLOR_LABELS[c]}</span>
				<span class="tabular-nums opacity-80">{count}</span>
			</button>
		{/each}
	</div>

	{#if visibleRows.length === 0}
		<section
			class="empty-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<p class="text-[15px] text-[var(--color-text-secondary)]">
				{COLOR_LABELS[selected]} 리본으로 북마크한 구절이 아직 없어요.
			</p>
			<p class="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
				라이브러리에서 구절을 열고 카드 모서리의 리본을 탭해 추가할 수 있어요.
			</p>
		</section>
	{:else}
		<div class="mb-3 flex items-center justify-between px-1">
			<p class="text-[13px] text-[var(--color-text-secondary)]">
				총 <span class="font-semibold text-[var(--color-text)]">{visibleRows.length}개</span>
			</p>
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={clearAllSelected}
					class="text-[12px] font-medium text-[var(--color-danger)] underline-offset-4 hover:underline"
				>
					이 색 전부 지우기
				</button>
				<button
					type="button"
					onclick={toggleVerseText}
					aria-pressed={showVerseText}
					aria-label={showVerseText ? '구절 본문 표시 끄기' : '구절 본문 표시 켜기'}
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
				>
					{#if showVerseText}
						<Eye size={16} />
					{:else}
						<EyeOff size={16} />
					{/if}
				</button>
			</div>
		</div>

		<div class="space-y-5">
			{#each visibleRows as row (row.bookmark.id)}
				<VerseCard
					verse={row.verse}
					packageName={row.packageName}
					packageId={row.bookmark.packageId}
					bookmark={row.bookmark.color}
					onBookmarkPick={(c) => pickColor(row, c)}
					onBookmarkClear={() => removeRow(row)}
					showBody={showVerseText}
				/>
			{/each}
		</div>
	{/if}
</main>

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}
