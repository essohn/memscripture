<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import FontScalePicker from '$lib/components/card/FontScalePicker.svelte';
	import { Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		listPackages,
		loadPackageData,
		level1Groups,
		tagsForVerse,
		type VerseTag
	} from '$lib/db/verses';
	import { getBookmark, setBookmark, clearBookmark } from '$lib/db/bookmarks';
	import { recordRecentVerse } from '$lib/db/recentVerses';
	import {
		getVerseRating,
		setStartDifficulty,
		setFullDifficulty,
		type DifficultyLevel
	} from '$lib/db/verseRatings';
	import {
		getShowVerseTextInList,
		setShowVerseTextInList,
		getVerseFontScale,
		setVerseFontScale,
		type VerseFontScale
	} from '$lib/db/viewOptions';
	import type { BookmarkColor, PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);
	const verseNo = $derived(parseInt(page.params.verseNo!, 10));

	let pkg: PackageMeta | null = $state(null);
	let verse: StoredVerse | null = $state(null);
	let verses: StoredVerse[] = $state([]);
	let groups: IndexGroup[] = $state([]);
	let bookmark: BookmarkColor | null = $state(null);
	let startDifficulty = $state<DifficultyLevel | null>(null);
	let fullDifficulty = $state<DifficultyLevel | null>(null);
	let error: string | null = $state(null);
	let showVerseText = $state(true);
	let fontScale = $state<VerseFontScale>(1.0);

	// Verse numbers can be sparse (e.g., 1, 2, 5, 7) — sort by `no` so prev/next
	// reflect the package's natural order, not the storage order.
	const sortedVerses = $derived([...verses].sort((a, b) => a.no - b.no));
	const currentIdx = $derived(sortedVerses.findIndex((v) => v.no === verseNo));
	const prevVerse = $derived(currentIdx > 0 ? sortedVerses[currentIdx - 1] : null);
	const nextVerse = $derived(
		currentIdx >= 0 && currentIdx < sortedVerses.length - 1
			? sortedVerses[currentIdx + 1]
			: null
	);

	$effect(() => {
		let active = true;
		(async () => {
			const [v, scale] = await Promise.all([getShowVerseTextInList(), getVerseFontScale()]);
			if (active) {
				showVerseText = v;
				fontScale = scale;
			}
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	function toggleVerseText() {
		showVerseText = !showVerseText;
		setShowVerseTextInList(showVerseText).catch(() => {});
	}

	function pickFontScale(scale: VerseFontScale) {
		fontScale = scale;
		setVerseFontScale(scale).catch(() => {});
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

				const [data, currentBookmark, currentRating] = await Promise.all([
					loadPackageData(currentPackageId),
					getBookmark(currentPackageId, currentVerseNo),
					getVerseRating(currentPackageId, currentVerseNo)
				]);
				if (active) {
					const v = data.verses.find((x) => x.no === currentVerseNo) ?? null;
					if (!v) error = '구절을 찾을 수 없습니다.';
					else verse = v;
					verses = data.verses;
					groups = data.groups;
					bookmark = currentBookmark?.color ?? null;
					startDifficulty = (currentRating?.startDifficulty ?? null) as DifficultyLevel | null;
					fullDifficulty = (currentRating?.fullDifficulty ?? null) as DifficultyLevel | null;
				}
				// Best-effort: stamp the recents table so the dashboard surfaces
				// this verse. Fire-and-forget; failures don't block the page.
				if (active && verse) {
					recordRecentVerse(currentPackageId, currentVerseNo).catch(() => {});
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

	async function onPickStartDifficulty(level: DifficultyLevel | null) {
		const pkgId = packageId;
		const vNo = verseNo;
		startDifficulty = level;
		await setStartDifficulty(pkgId, vNo, level).catch(() => {});
	}

	async function onPickFullDifficulty(level: DifficultyLevel | null) {
		const pkgId = packageId;
		const vNo = verseNo;
		fullDifficulty = level;
		await setFullDifficulty(pkgId, vNo, level).catch(() => {});
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
		<div class="mb-3 flex items-center justify-end gap-1 px-1">
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
		<!--
			Re-key on verse number so memorize mode + reveal state reset cleanly
			when the user navigates prev/next — otherwise the new verse inherits
			the previous gesture's "half-revealed" state.
		-->
		{#key verse.no}
			<VerseCard
				{verse}
				packageName={pkg?.abbreviation}
				{packageId}
				{tags}
				{bookmark}
				{onBookmarkPick}
				{onBookmarkClear}
				{startDifficulty}
				{fullDifficulty}
				{onPickStartDifficulty}
				{onPickFullDifficulty}
				showBody={showVerseText}
				{fontScale}
			/>
		{/key}

		{#if prevVerse || nextVerse}
			<nav
				class="mt-8 flex items-center justify-between gap-2"
				aria-label="구절 이동"
			>
				{#if prevVerse}
					<a
						href={`/library/${packageId}/${prevVerse.no}`}
						class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-elevated)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
					>
						<ChevronLeft size={16} strokeWidth={1.75} />
						<span>{prevVerse.no}구절</span>
					</a>
				{:else}
					<span aria-hidden="true"></span>
				{/if}
				{#if nextVerse}
					<a
						href={`/library/${packageId}/${nextVerse.no}`}
						class="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-elevated)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
					>
						<span>{nextVerse.no}구절</span>
						<ChevronRight size={16} strokeWidth={1.75} />
					</a>
				{:else}
					<span aria-hidden="true"></span>
				{/if}
			</nav>
		{/if}
	{/if}
</main>
