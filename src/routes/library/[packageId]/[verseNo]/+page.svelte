<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		listPackages,
		loadPackageData,
		level1Groups,
		tagsForVerse,
		type VerseTag
	} from '$lib/db/verses';
	import { getBookmark, setBookmark, clearBookmark } from '$lib/db/bookmarks';
	import { getShowVerseTextInList, setShowVerseTextInList } from '$lib/db/viewOptions';
	import type { BookmarkColor, PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);
	const verseNo = $derived(parseInt(page.params.verseNo!, 10));

	let pkg: PackageMeta | null = $state(null);
	let verse: StoredVerse | null = $state(null);
	let groups: IndexGroup[] = $state([]);
	let bookmark: BookmarkColor | null = $state(null);
	let error: string | null = $state(null);
	let showVerseText = $state(true);

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

	$effect(() => {
		let active = true;
		const currentPackageId = packageId;
		const currentVerseNo = verseNo;
		// Reset error only — let the verse value fall in place from the cached lookup
		error = null;
		(async () => {
			try {
				const all = await listPackages();
				const found = all.find((p) => p.id === currentPackageId);
				if (!found) {
					if (active) error = '패키지를 찾을 수 없습니다.';
					return;
				}
				if (active) pkg = found;

				const [data, currentBookmark] = await Promise.all([
					loadPackageData(currentPackageId),
					getBookmark(currentPackageId, currentVerseNo)
				]);
				if (active) {
					const v = data.verses.find((x) => x.no === currentVerseNo) ?? null;
					if (!v) error = '구절을 찾을 수 없습니다.';
					else verse = v;
					groups = data.groups;
					bookmark = currentBookmark?.color ?? null;
				}
			} catch (e) {
				if (active) error = String(e);
			}
		})();
		return () => {
			active = false;
		};
	});

	async function onBookmarkPick(color: BookmarkColor) {
		const pkgId = packageId;
		const vNo = verseNo;
		bookmark = color;
		await setBookmark(pkgId, vNo, color).catch(() => {});
	}

	async function onBookmarkClear() {
		const pkgId = packageId;
		const vNo = verseNo;
		bookmark = null;
		await clearBookmark(pkgId, vNo).catch(() => {});
	}

	// Suppress tags for flat single-group packages
	const tags = $derived.by(() => {
		if (!verse) return [] as VerseTag[];
		if (level1Groups(groups).length <= 1) return [] as VerseTag[];
		return tagsForVerse(groups, verseNo);
	});
</script>

<Header title={pkg?.abbreviation ?? '...'} onBack={() => history.back()} />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	{#if error}
		<p role="alert" class="text-[var(--color-danger)]">{error}</p>
	{:else if !verse}
		<p role="status" class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<div class="mb-3 flex items-center justify-end px-1">
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
		<VerseCard
			{verse}
			packageName={pkg?.abbreviation}
			{packageId}
			{tags}
			{bookmark}
			{onBookmarkPick}
			{onBookmarkClear}
			showBody={showVerseText}
		/>
	{/if}
</main>
