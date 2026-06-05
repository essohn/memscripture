<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageTabStrip from '$lib/components/nav/PackageTabStrip.svelte';
	import SeriesSubTabStrip from '$lib/components/filter/SeriesSubTabStrip.svelte';
	import GroupSubStrip from '$lib/components/filter/GroupSubStrip.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import FontScalePicker from '$lib/components/card/FontScalePicker.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Eye, EyeOff, Bookmark } from 'lucide-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { level1Groups, level2GroupsInSeries, filterVerses } from '$lib/db/verses';
	import { recordPackageView } from '$lib/db/recent';
	import { recordRecentVerse } from '$lib/db/recentVerses';
	import {
		getShowVerseTextInList,
		setShowVerseTextInList,
		getVerseFontScale,
		setVerseFontScale,
		type VerseFontScale
	} from '$lib/db/viewOptions';
	import { getActivePackageId, setActivePackage } from '$lib/db/activePackage';
	import { db } from '$lib/db/local';
	import { setBookmark, clearBookmark } from '$lib/db/bookmarks';
	import {
		setStartDifficulty,
		setFullDifficulty,
		type DifficultyLevel
	} from '$lib/db/verseRatings';
	import { BOOKMARK_COLORS, type BookmarkColor } from '$lib/types';
	import type { PageData } from './$types';

	interface VerseRowRating {
		start: DifficultyLevel | null;
		full: DifficultyLevel | null;
	}

	let { data }: { data: PageData } = $props();

	const packageId = $derived(page.params.packageId!);

	// '이 패키지로 암송 시작' 흐름이 아직 연결되지 않아 버튼을 숨겨 둔다.
	// 기능이 준비되면 이 플래그만 true 로 바꾸면 버튼이 다시 노출된다.
	const ENABLE_ACTIVATE_PACKAGE = false;

	let showVerseText = $state(true);
	let fontScale = $state<VerseFontScale>(1.0);
	let activePackageId: string | null = $state(null);
	let bannerVisible = $state(false);
	let ratingsByVerseNo = $state<Map<number, VerseRowRating>>(new Map());
	let bookmarksByVerseNo = $state<Map<number, BookmarkColor>>(new Map());

	// Multi-select: a Set of verse.no the user has tapped. When non-empty, the
	// selected cards stay bright while the rest dim, and a confirm bar appears.
	let selectedVerseNos = $state<Set<number>>(new Set());
	let toast = $state<{ message: string } | null>(null);
	const selectionActive = $derived(selectedVerseNos.size > 0);

	// Deep-link target from the home dashboard: /library/{id}?v={no} scrolls the
	// list to that verse and flashes it, instead of opening the single-verse view.
	let highlightVerseNo = $state<number | null>(null);

	function toggleSelect(no: number) {
		// Reassign (not mutate) so Svelte's $state reactivity fires.
		const next = new Set(selectedVerseNos);
		if (next.has(no)) next.delete(no);
		else next.add(no);
		selectedVerseNos = next;
	}

	// Bulk-bookmark palette toggled from the selection bar.
	let bookmarkPaletteOpen = $state(false);

	const COLOR_LABELS: Record<BookmarkColor, string> = {
		red: '빨강',
		amber: '주황',
		green: '초록',
		blue: '파랑',
		purple: '보라'
	};

	function clearSelection() {
		selectedVerseNos = new Set();
		bookmarkPaletteOpen = false;
	}

	// Confirm: write each selected verse into the recent-verses store so it
	// surfaces on the home dashboard's history. Best-effort per verse — a single
	// failed put shouldn't abort the rest.
	async function confirmSelection() {
		const nos = [...selectedVerseNos];
		if (nos.length === 0) return;
		await Promise.all(nos.map((no) => recordRecentVerse(packageId, no).catch(() => {})));
		toast = { message: `최근 구절에 ${nos.length}개 담았습니다` };
		clearSelection();
	}

	// Apply one ribbon color to every selected verse at once. Optimistically
	// updates the in-memory map so the ribbons reflect immediately, then persists.
	async function bulkBookmark(color: BookmarkColor) {
		const nos = [...selectedVerseNos];
		if (nos.length === 0) return;
		const next = new Map(bookmarksByVerseNo);
		for (const no of nos) next.set(no, color);
		bookmarksByVerseNo = next;
		await Promise.all(nos.map((no) => setBookmark(packageId, no, color).catch(() => {})));
		toast = { message: `${COLOR_LABELS[color]} 리본으로 ${nos.length}개 북마크했습니다` };
		clearSelection();
	}

	// React to the ?v= deep-link: scroll the matching card to center and flash it.
	// requestAnimationFrame waits for the list to paint; the cleanup cancels a
	// pending frame if the param changes again before it fires.
	$effect(() => {
		const raw = page.url.searchParams.get('v');
		if (raw === null) return;
		const no = parseInt(raw, 10);
		if (!Number.isInteger(no)) return;
		let cancelled = false;
		const raf = requestAnimationFrame(() => {
			if (cancelled) return;
			const el = document.getElementById(`verse-${no}`);
			if (!el) return;
			el.scrollIntoView({ block: 'center', behavior: 'smooth' });
			highlightVerseNo = no;
			setTimeout(() => {
				if (highlightVerseNo === no) highlightVerseNo = null;
			}, 1800);
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	});

	// Side effects: load preferences, record recent view, hydrate per-verse state
	$effect(() => {
		let active = true;
		const currentPackageId = packageId;
		recordPackageView(currentPackageId).catch(() => {});
		(async () => {
			const [eye, scale] = await Promise.all([
				getShowVerseTextInList(),
				getVerseFontScale()
			]);
			if (active) {
				showVerseText = eye;
				fontScale = scale;
			}
		})().catch(() => {});
		(async () => {
			activePackageId = await getActivePackageId();
		})().catch(() => {});

		// One bulk read each for ratings + bookmarks — avoids N round-trips for
		// long lists. Both tables are indexed on packageId; rows only exist after
		// the user interacts, so the scans stay small.
		(async () => {
			const [ratingRows, bookmarkRows] = await Promise.all([
				db.verseRatings.where('packageId').equals(currentPackageId).toArray(),
				db.bookmarks.where('packageId').equals(currentPackageId).toArray()
			]);
			if (!active) return;
			const nextRatings = new Map<number, VerseRowRating>();
			for (const r of ratingRows) {
				nextRatings.set(r.verseNo, {
					start: (r.startDifficulty ?? null) as DifficultyLevel | null,
					full: (r.fullDifficulty ?? null) as DifficultyLevel | null
				});
			}
			ratingsByVerseNo = nextRatings;
			const nextBookmarks = new Map<number, BookmarkColor>();
			for (const b of bookmarkRows) nextBookmarks.set(b.verseNo, b.color);
			bookmarksByVerseNo = nextBookmarks;
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	function pickBookmark(verseNo: number, color: BookmarkColor) {
		bookmarksByVerseNo = new Map(bookmarksByVerseNo).set(verseNo, color);
		setBookmark(packageId, verseNo, color).catch(() => {});
	}

	function clearVerseBookmark(verseNo: number) {
		const next = new Map(bookmarksByVerseNo);
		next.delete(verseNo);
		bookmarksByVerseNo = next;
		clearBookmark(packageId, verseNo).catch(() => {});
	}

	function pickStart(verseNo: number, level: DifficultyLevel | null) {
		const current = ratingsByVerseNo.get(verseNo) ?? { start: null, full: null };
		ratingsByVerseNo = new Map(ratingsByVerseNo).set(verseNo, {
			...current,
			start: level
		});
		setStartDifficulty(packageId, verseNo, level).catch(() => {});
	}

	function pickFull(verseNo: number, level: DifficultyLevel | null) {
		const current = ratingsByVerseNo.get(verseNo) ?? { start: null, full: null };
		ratingsByVerseNo = new Map(ratingsByVerseNo).set(verseNo, {
			...current,
			full: level
		});
		setFullDifficulty(packageId, verseNo, level).catch(() => {});
	}

	function pickFontScale(scale: VerseFontScale) {
		fontScale = scale;
		setVerseFontScale(scale).catch(() => {});
	}

	// Derive filter state from URL search params
	function parseSeriesIndex(s: string | null): number | null {
		if (s === null) return null;
		const n = parseInt(s, 10);
		return Number.isInteger(n) && n >= 0 ? n : null;
	}
	function parseGroupIndices(s: string | null): number[] {
		if (s === null || s === '') return [];
		return s
			.split(',')
			.map((p) => parseInt(p, 10))
			.filter((n) => Number.isInteger(n) && n >= 0);
	}

	const seriesIndex = $derived(parseSeriesIndex(page.url.searchParams.get('s')));
	const groupIndices = $derived(parseGroupIndices(page.url.searchParams.get('g')));

	const series = $derived(level1Groups(data.groups));
	const subGroups = $derived(level2GroupsInSeries(data.groups, seriesIndex));
	const filteredVerses = $derived(
		filterVerses(data.verses, data.groups, seriesIndex, groupIndices)
	);

	// URL mutation helpers
	function navigateFilter(s: number | null, g: number[]) {
		const params = new URLSearchParams();
		if (s !== null) params.set('s', String(s));
		if (g.length > 0) params.set('g', g.join(','));
		const qs = params.toString();
		const href = `/library/${packageId}${qs ? `?${qs}` : ''}`;
		goto(href, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function selectSeries(idx: number | null) {
		navigateFilter(idx, []);
	}

	function toggleGroup(idx: number) {
		const next = groupIndices.includes(idx)
			? groupIndices.filter((i) => i !== idx)
			: [...groupIndices, idx].sort((a, b) => a - b);
		navigateFilter(seriesIndex, next);
	}

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}

	async function activatePackage() {
		await setActivePackage(packageId);
		activePackageId = packageId;
		bannerVisible = true;
		// auto-dismiss after 3s
		setTimeout(() => {
			bannerVisible = false;
		}, 3000);
	}
</script>

<Header title={data.pkg.name} onBack={() => goto('/library')} />

<main class="mx-auto max-w-2xl px-5 pt-2 {selectionActive ? 'pb-28' : 'pb-8'}">
	<PackageTabStrip packages={data.allPackages} currentId={packageId} />

	{#if ENABLE_ACTIVATE_PACKAGE || activePackageId === packageId}
		<div class="mb-4 flex items-center justify-between gap-2 px-1">
			<div class="text-[12px] text-[var(--color-text-secondary)]">
				{#if activePackageId === packageId}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-accent)]"
					>
						암송 중
					</span>
				{/if}
			</div>
			{#if ENABLE_ACTIVATE_PACKAGE && activePackageId !== packageId}
				<button
					type="button"
					onclick={activatePackage}
					class="inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
				>
					이 패키지로 암송 시작
				</button>
			{/if}
		</div>
	{/if}

	{#if bannerVisible}
		<div
			role="status"
			class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-4 py-3 text-[13px] text-[var(--color-text)]"
		>
			<span>활성 패키지로 설정되었습니다.</span>
			<a
				href="/today"
				class="rounded-full bg-[var(--color-accent)] px-3 py-1 text-[12px] font-medium text-white hover:opacity-90"
			>
				오늘의 큐 →
			</a>
		</div>
	{/if}

	<div class="mb-3 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
		<span class="font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
			{data.pkg.translation_name}
		</span>
		<span class="h-3 w-px bg-[var(--color-border)]" aria-hidden="true"></span>
		<span class="inline-flex items-center gap-1.5">
			<span class="h-px w-4 bg-[var(--color-accent)]/60"></span>
			{filteredVerses.length} / {data.verses.length}개
		</span>
		<div class="ml-auto flex items-center gap-1">
			<FontScalePicker value={fontScale} onpick={pickFontScale} />
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

	<SeriesSubTabStrip {series} activeIndex={seriesIndex} onSelect={selectSeries} />
	<GroupSubStrip groups={subGroups} activeIndices={groupIndices} onToggle={toggleGroup} />

	<div class="space-y-5">
		{#each filteredVerses as v (v.no)}
			{@const tags = data.tagsByVerseNo.get(v.no) ?? []}
			{@const rating = ratingsByVerseNo.get(v.no)}
			<div id={`verse-${v.no}`} class="scroll-mt-24">
				<VerseCard
					verse={v}
					packageName={data.pkg.abbreviation}
					{packageId}
					{tags}
					bookmark={bookmarksByVerseNo.get(v.no) ?? null}
					onBookmarkPick={(c) => pickBookmark(v.no, c)}
					onBookmarkClear={() => clearVerseBookmark(v.no)}
					startDifficulty={rating?.start ?? null}
					fullDifficulty={rating?.full ?? null}
					onPickStartDifficulty={(l) => pickStart(v.no, l)}
					onPickFullDifficulty={(l) => pickFull(v.no, l)}
					showBody={showVerseText}
					{fontScale}
					selected={selectedVerseNos.has(v.no)}
					dimmed={selectionActive && !selectedVerseNos.has(v.no)}
					onToggleSelect={() => toggleSelect(v.no)}
					highlighted={highlightVerseNo === v.no}
				/>
			</div>
		{/each}
	</div>
</main>

<!-- Selection confirm bar: floats just above the TabBar while ≥1 verse is
     selected. '본 구절에 담기' records the picks into the home history. -->
{#if selectionActive}
	<div class="fixed inset-x-0 z-40" style="bottom: calc(64px + env(safe-area-inset-bottom));">
		<div class="mx-auto max-w-2xl px-5 pb-3">
			{#if bookmarkPaletteOpen}
				<!-- Color palette: tap a ribbon to bookmark every selected verse with it. -->
				<div
					class="mb-2 flex items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 shadow-lg"
				>
					{#each BOOKMARK_COLORS as c (c)}
						<button
							type="button"
							onclick={() => bulkBookmark(c)}
							aria-label={`${COLOR_LABELS[c]} 리본으로 북마크`}
							class="h-8 w-8 rounded-full border border-black/5 transition-transform hover:scale-110"
							style={`background-color: var(--color-ribbon-${c});`}
						></button>
					{/each}
				</div>
			{/if}
			<div
				class="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 shadow-lg"
			>
				<span class="text-[13px] text-[var(--color-text-secondary)]">
					<span class="font-semibold text-[var(--color-text)]">{selectedVerseNos.size}개</span> 선택됨
				</span>
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						onclick={clearSelection}
						class="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
					>
						해제
					</button>
					<button
						type="button"
						onclick={() => (bookmarkPaletteOpen = !bookmarkPaletteOpen)}
						aria-label="선택한 구절 북마크"
						aria-expanded={bookmarkPaletteOpen}
						class="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors {bookmarkPaletteOpen
							? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
							: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'}"
					>
						<Bookmark size={16} strokeWidth={1.75} />
					</button>
					<button
						type="button"
						onclick={confirmSelection}
						class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
					>
						최근 구절에 담기
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if toast}
	<Toast message={toast.message} onClose={() => (toast = null)} />
{/if}
