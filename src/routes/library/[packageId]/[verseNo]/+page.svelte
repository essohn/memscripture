<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { listPackages, installPackage, readVerse } from '$lib/db/verses';
	import type { PackageMeta } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);
	const verseNo = $derived(parseInt(page.params.verseNo!, 10));

	let pkg: PackageMeta | null = $state(null);
	let verse: StoredVerse | null = $state(null);
	let error: string | null = $state(null);

	$effect(() => {
		let active = true;
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
				const v = await readVerse(packageId, verseNo);
				if (active) {
					if (!v) error = '구절을 찾을 수 없습니다.';
					else verse = v;
				}
			} catch (e) {
				if (active) error = String(e);
			}
		})();
		return () => {
			active = false;
		};
	});
</script>

<Header title={pkg?.abbreviation ?? '...'} onBack={() => goto(`/library/${packageId}`)} />

<main class="max-w-md mx-auto px-5 pt-4 pb-8">
	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if !verse}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<VerseCard {verse} packageName={pkg?.abbreviation} />
	{/if}
</main>
