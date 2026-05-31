<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageTabStrip from '$lib/components/nav/PackageTabStrip.svelte';
	import SeriesSubTabStrip from '$lib/components/filter/SeriesSubTabStrip.svelte';
	import GroupSubStrip from '$lib/components/filter/GroupSubStrip.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import FontScalePicker from '$lib/components/card/FontScalePicker.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { level1Groups, level2GroupsInSeries, filterVerses } from '$lib/db/verses';
	import { recordPackageView } from '$lib/db/recent';
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
	import type { BookmarkColor } from '$lib/types';
	import type { PageData } from './$types';

	interface VerseRowRating {
		start: DifficultyLevel | null;
		full: DifficultyLevel | null;
	}

	let { data }: { data: PageData } = $props();

	const packageId = $derived(page.params.packageId!);

	let showVerseText = $state(true);
	let fontScale = $state<VerseFontScale>(1.0);
	let activePackageId: string | null = $state(null);
	let bannerVisible = $state(false);
	let ratingsByVerseNo = $state<Map<number, VerseRowRating>>(new Map());
	let bookmarksByVerseNo = $state<Map<number, BookmarkColor>>(new Map());

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

<main class="mx-auto max-w-2xl px-5 pb-8 pt-2">
	<PackageTabStrip packages={data.allPackages} currentId={packageId} />

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
		{#if activePackageId !== packageId}
			<button
				type="button"
				onclick={activatePackage}
				class="inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
			>
				이 패키지로 암송 시작
			</button>
		{/if}
	</div>

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
			/>
		{/each}
	</div>
</main>
