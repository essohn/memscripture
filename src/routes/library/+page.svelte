<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageCard from '$lib/components/PackageCard.svelte';
	import { listPackages } from '$lib/db/verses';
	import type { PackageMeta } from '$lib/types';

	let packages: PackageMeta[] = $state([]);
	let error: string | null = $state(null);

	$effect(() => {
		listPackages()
			.then((p) => (packages = p))
			.catch((e) => (error = String(e)));
	});
</script>

<Header title="Library" />

<main class="max-w-md mx-auto px-5 pt-4 pb-8 space-y-3">
	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if packages.length === 0}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		{#each packages as pkg (pkg.id)}
			<PackageCard {pkg} />
		{/each}
	{/if}
</main>
