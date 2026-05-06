<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { listPackages, installPackage, listVerses } from '$lib/db/verses';
	import type { PackageMeta } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	const packageId = $derived(page.params.packageId!);

	let pkg: PackageMeta | null = $state(null);
	let verses: StoredVerse[] = $state([]);
	let loading = $state(true);
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
				const v = await listVerses(packageId);
				if (active) {
					verses = v;
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
</script>

<Header title={pkg?.name ?? '...'} onBack={() => goto('/library')} />

<main class="max-w-md mx-auto px-5 pt-4 pb-8">
	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if loading || !pkg}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<GroupList {packageId} {verses} />
	{/if}
</main>
