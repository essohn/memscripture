<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageTabStrip from '$lib/components/nav/PackageTabStrip.svelte';
	import SeriesSubTabStrip from '$lib/components/filter/SeriesSubTabStrip.svelte';
	import GroupSubStrip from '$lib/components/filter/GroupSubStrip.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { level1Groups, level2GroupsInSeries, filterVerses } from '$lib/db/verses';
	import { recordPackageView } from '$lib/db/recent';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import { getActivePackageId, setActivePackage } from '$lib/db/activePackage';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const packageId = $derived(page.params.packageId!);

	let showVerseText = $state(true);
	let activePackageId: string | null = $state(null);
	let bannerVisible = $state(false);

	// Side effects: load preference + record recent view
	$effect(() => {
		let active = true;
		const currentPackageId = packageId;
		recordPackageView(currentPackageId).catch(() => {});
		getShowVerseTextInList()
			.then((v) => {
				if (active) showVerseText = v;
			})
			.catch(() => {});
		(async () => {
			activePackageId = await getActivePackageId();
		})().catch(() => {});
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
			<span>활성 패키지로 설정되었어요.</span>
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
		tagsByVerseNo={data.tagsByVerseNo}
		{showVerseText}
	/>
</main>
