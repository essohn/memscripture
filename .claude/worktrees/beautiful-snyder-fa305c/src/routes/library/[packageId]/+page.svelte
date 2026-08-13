<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageTabStrip from '$lib/components/nav/PackageTabStrip.svelte';
	import SeriesSubTabStrip from '$lib/components/filter/SeriesSubTabStrip.svelte';
	import GroupSubStrip from '$lib/components/filter/GroupSubStrip.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		listPackages,
		loadPackageData,
		level1Groups,
		level2GroupsInSeries,
		filterVerses,
		type VerseTag
	} from '$lib/db/verses';
	import { recordPackageView } from '$lib/db/recent';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import type { PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);

	let allPackages: PackageMeta[] = $state([]);
	let pkg: PackageMeta | null = $state(null);
	let verses: StoredVerse[] = $state([]);
	let groups: IndexGroup[] = $state([]);
	let tagsByVerseNo: Map<number, VerseTag[]> = $state(new Map());
	let loading = $state(true);
	let error: string | null = $state(null);
	let showVerseText = $state(true);

	$effect(() => {
		let active = true;
		const currentPackageId = packageId; // snapshot for effect closure
		// Only reset transient state on packageId change (avoids stale flash, but also
		// avoids unnecessary loading flash on back-nav for the same package).
		// Use untrack to read pkg without subscribing to it (prevents effect re-entry loop).
		const currentPkg = untrack(() => pkg);
		if (currentPkg && currentPkg.id !== currentPackageId) {
			pkg = null;
			verses = [];
			groups = [];
			error = null;
		}
		loading = true;
		// Load view preference (fire-and-forget, default already applied)
		getShowVerseTextInList()
			.then((v) => {
				if (active) showVerseText = v;
			})
			.catch(() => {});
		(async () => {
			try {
				const all = await listPackages();
				if (active) allPackages = all;
				const found = all.find((p) => p.id === currentPackageId);
				if (!found) {
					if (active) {
						error = '패키지를 찾을 수 없습니다.';
						loading = false;
					}
					return;
				}
				if (active) pkg = found;
				// Fire-and-forget: record this package as recently viewed
				recordPackageView(currentPackageId).catch(() => {});

				const data = await loadPackageData(currentPackageId);
				if (active) {
					verses = data.verses;
					groups = data.groups;
					tagsByVerseNo = data.tagsByVerseNo;
					loading = false;
				}
			} catch (e) {
				if (active) {
					error = String(e);
					loading = false;
				}
			}
		})();
		return () => {
			active = false;
		};
	});

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

	const series = $derived(level1Groups(groups));
	const subGroups = $derived(level2GroupsInSeries(groups, seriesIndex));
	const filteredVerses = $derived(filterVerses(verses, groups, seriesIndex, groupIndices));

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
		// Changing series clears group filter
		navigateFilter(idx, []);
	}

	function toggleGroup(idx: number) {
		const next = groupIndices.includes(idx)
			? groupIndices.filter((i) => i !== idx)
			: [...groupIndices, idx].sort((a, b) => a - b);
		navigateFilter(seriesIndex, next);
	}

	function onTagClick(tag: VerseTag) {
		if (tag.level === 1) {
			selectSeries(tag.seriesIndex);
		} else {
			// level-2: ensure parent series is selected, then toggle the group
			if (seriesIndex !== tag.seriesIndex) {
				navigateFilter(tag.seriesIndex, [tag.groupIndex]);
			} else {
				toggleGroup(tag.groupIndex);
			}
		}
	}

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}
</script>

<Header title={pkg?.name ?? '...'} onBack={() => goto('/library')} />

<main class="mx-auto max-w-md px-5 pb-8 pt-2">
	{#if error}
		<p role="alert" class="text-[var(--color-danger)]">{error}</p>
	{:else if loading || !pkg}
		<p role="status" class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<PackageTabStrip packages={allPackages} currentId={packageId} />

		<div class="mb-3 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
			<span class="font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
				{pkg.translation_name}
			</span>
			<span class="h-3 w-px bg-[var(--color-border)]" aria-hidden="true"></span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-px w-4 bg-[var(--color-accent)]/60"></span>
				{filteredVerses.length} / {verses.length}개
			</span>
			<button
				type="button"
				onclick={toggleVerseText}
				aria-pressed={showVerseText}
				aria-label={showVerseText ? '구절 본문 표시 끄기' : '구절 본문 표시 켜기'}
				class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
			>
				{#if showVerseText}
					<Eye size={16} />
				{:else}
					<EyeOff size={16} />
				{/if}
			</button>
		</div>

		<SeriesSubTabStrip {series} activeIndex={seriesIndex} onSelect={selectSeries} />
		<GroupSubStrip groups={subGroups} activeIndices={groupIndices} onToggle={toggleGroup} />

		<GroupList
			{packageId}
			verses={filteredVerses}
			{tagsByVerseNo}
			activeSeriesIndex={seriesIndex}
			activeGroupIndices={groupIndices}
			{onTagClick}
			{showVerseText}
		/>
	{/if}
</main>
