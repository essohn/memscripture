<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		listPackages,
		installPackage,
		readVerse,
		listGroups,
		tagsForVerse,
		level1Groups,
		type VerseTag
	} from '$lib/db/verses';
	import type { PackageMeta, IndexGroup } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);
	const verseNo = $derived(parseInt(page.params.verseNo!, 10));

	let pkg: PackageMeta | null = $state(null);
	let verse: StoredVerse | null = $state(null);
	let groups: IndexGroup[] = $state([]);
	let error: string | null = $state(null);

	$effect(() => {
		let active = true;
		// Reset state on packageId/verseNo change
		pkg = null;
		verse = null;
		groups = [];
		error = null;
		(async () => {
			try {
				const all = await listPackages();
				const found = all.find((p) => p.id === packageId);
				if (!found) {
					if (active) error = '패키지를 찾을 수 없습니다.';
					return;
				}
				if (active) pkg = found;
				await installPackage(packageId);
				const [v, g] = await Promise.all([
					readVerse(packageId, verseNo),
					listGroups(packageId)
				]);
				if (active) {
					if (!v) error = '구절을 찾을 수 없습니다.';
					else verse = v;
					groups = g;
				}
			} catch (e) {
				if (active) error = String(e);
			}
		})();
		return () => {
			active = false;
		};
	});

	// Suppress tags for flat single-group packages
	const tags = $derived.by(() => {
		if (!verse) return [] as VerseTag[];
		if (level1Groups(groups).length <= 1) return [] as VerseTag[];
		return tagsForVerse(groups, verseNo);
	});
</script>

<Header title={pkg?.abbreviation ?? '...'} onBack={() => goto(`/library/${packageId}`)} />

<main class="mx-auto max-w-md px-5 pb-8 pt-4">
	{#if error}
		<p role="alert" class="text-[var(--color-danger)]">{error}</p>
	{:else if !verse}
		<p role="status" class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<VerseCard {verse} packageName={pkg?.abbreviation} {packageId} {tags} />
	{/if}
</main>
