<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { BookmarkCheck, X } from 'lucide-svelte';
	import { clearBookmark, clearAllOfColor } from '$lib/db/bookmarks';
	import { BOOKMARK_COLORS, type BookmarkColor } from '$lib/types';
	import { extractFirstClause } from '$lib/srs/firstClause';
	import type { BookmarksLoadData, BookmarkedRow } from './+page';

	let { data }: { data: BookmarksLoadData } = $props();

	let rows = $state<BookmarkedRow[]>(data.rows);
	let selected = $state<BookmarkColor>('red');

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

	async function removeRow(row: BookmarkedRow) {
		const { packageId, verseNo } = row.bookmark;
		rows = rows.filter((r) => r.bookmark.id !== row.bookmark.id);
		await clearBookmark(packageId, verseNo).catch(() => {});
	}

	async function clearAllSelected() {
		const color = selected;
		const target = rows.filter((r) => r.bookmark.color === color);
		if (target.length === 0) return;
		const ok = window.confirm(
			`${COLOR_LABELS[color]} 리본 ${target.length}개를 모두 지울까요?`
		);
		if (!ok) return;
		rows = rows.filter((r) => r.bookmark.color !== color);
		await clearAllOfColor(color).catch(() => {});
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
				오늘 화면에서 구절을 외운 뒤 카드 아래 북마크 영역을 눌러 추가할 수 있어요.
			</p>
		</section>
	{:else}
		<div class="mb-3 flex items-center justify-between px-1">
			<p class="text-[13px] text-[var(--color-text-secondary)]">
				총 <span class="font-semibold text-[var(--color-text)]">{visibleRows.length}개</span>
			</p>
			<button
				type="button"
				onclick={clearAllSelected}
				class="text-[12px] font-medium text-[var(--color-danger)] underline-offset-4 hover:underline"
			>
				이 색 전부 지우기
			</button>
		</div>

		<ul class="space-y-3">
			{#each visibleRows as row (row.bookmark.id)}
				<li
					class="row-card relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4"
				>
					<div class="flex items-start gap-3">
						<BookmarkCheck
							size={18}
							strokeWidth={2}
							color={`var(--color-ribbon-${row.bookmark.color})`}
							class="mt-0.5 shrink-0"
						/>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<p class="text-[15px] font-semibold tabular-nums text-[var(--color-text)]">
									{row.verse.cite}
								</p>
								<p class="truncate text-[12px] text-[var(--color-text-tertiary)]">
									{row.packageName}
								</p>
							</div>
							{#if row.verse.title}
								<p class="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
									{row.verse.title}
								</p>
							{/if}
							<p
								class="mt-2 break-keep text-[14px] leading-relaxed text-[var(--color-text-secondary)]"
							>
								{extractFirstClause(row.verse.w)}…
							</p>
						</div>
						<button
							type="button"
							onclick={() => removeRow(row)}
							aria-label="이 북마크 지우기"
							class="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-danger)]"
						>
							<X size={16} strokeWidth={1.75} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.row-card {
		box-shadow: var(--shadow-soft);
	}
	.empty-card {
		box-shadow: var(--shadow-soft);
	}
</style>
