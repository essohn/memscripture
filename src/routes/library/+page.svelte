<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageCard from '$lib/components/PackageCard.svelte';
	import { listPackages } from '$lib/db/verses';
	import { getRecentPackageIds } from '$lib/db/recent';
	import type { PackageMeta } from '$lib/types';

	let packages: PackageMeta[] = $state([]);
	let recentIds: string[] = $state([]);
	let error: string | null = $state(null);

	$effect(() => {
		listPackages()
			.then(async (p) => {
				packages = p;
				recentIds = await getRecentPackageIds();
			})
			.catch((e) => (error = String(e)));
	});
</script>

<Header title="Library" />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div class="mb-5 px-1">
		<p class="text-[13px] text-[var(--color-text-secondary)]">
			{#if packages.length}
				총 <span class="font-semibold text-[var(--color-text)]">{packages.length}개</span> 패키지
			{:else}
				패키지 둘러보기
			{/if}
		</p>
	</div>

	<div class="space-y-3">
		{#if error}
			<p class="text-[var(--color-danger)]">{error}</p>
		{:else if packages.length === 0}
			<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
		{:else}
			{#each packages as pkg (pkg.id)}
				<PackageCard {pkg} recent={recentIds.includes(pkg.id)} />
			{/each}
		{/if}
	</div>
</main>
