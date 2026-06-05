<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageCard from '$lib/components/PackageCard.svelte';
	import PackageReorderList from '$lib/components/PackageReorderList.svelte';
	import { listPackages } from '$lib/db/verses';
	import { getRecentPackageIds } from '$lib/db/recent';
	import { setPackageOrder } from '$lib/db/packageOrder';
	import type { PackageMeta } from '$lib/types';

	let packages: PackageMeta[] = $state([]);
	let recentIds: string[] = $state([]);
	let error: string | null = $state(null);
	let editMode = $state(false);

	$effect(() => {
		listPackages()
			.then(async (p) => {
				packages = p;
				recentIds = await getRecentPackageIds();
			})
			.catch((e) => (error = String(e)));
	});

	// Persist on every move; the reorder list keeps its own working copy, so we
	// don't re-read packages here (that would reset an in-progress edit).
	function handleReorder(ids: string[]) {
		setPackageOrder(ids).catch(() => {});
	}

	async function resetOrder() {
		await setPackageOrder([]).catch(() => {});
		packages = await listPackages().catch(() => packages);
	}

	async function exitEdit() {
		editMode = false;
		packages = await listPackages().catch(() => packages);
	}
</script>

<Header title="Library" />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-4">
	<div class="mb-5 flex items-center justify-between gap-3 px-1">
		<p class="text-[13px] text-[var(--color-text-secondary)]">
			{#if editMode}
				핸들 <span class="font-semibold text-[var(--color-text)]">☰</span> 을 끌어 순서를 바꾸세요
			{:else if packages.length}
				총 <span class="font-semibold text-[var(--color-text)]">{packages.length}개</span> 패키지
			{:else}
				패키지 둘러보기
			{/if}
		</p>
		{#if packages.length > 0}
			{#if editMode}
				<div class="flex shrink-0 items-center gap-3">
					<button
						type="button"
						onclick={resetOrder}
						class="text-[12px] font-medium text-[var(--color-text-tertiary)] underline-offset-4 hover:underline"
					>
						기본 순서로
					</button>
					<button
						type="button"
						onclick={exitEdit}
						class="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
					>
						완료
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (editMode = true)}
					class="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
				>
					순서 편집
				</button>
			{/if}
		{/if}
	</div>

	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if packages.length === 0}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else if editMode}
		<PackageReorderList {packages} onReorder={handleReorder} />
	{:else}
		<div class="space-y-3">
			{#each packages as pkg (pkg.id)}
				<PackageCard {pkg} recent={recentIds.includes(pkg.id)} />
			{/each}
		</div>
	{/if}
</main>
