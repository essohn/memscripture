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

<main class="mx-auto max-w-md px-5 pb-8 pt-4">
	{#if error}
		<p class="text-[var(--color-danger)]">{error}</p>
	{:else if loading || !pkg}
		<p class="text-[var(--color-text-tertiary)]">불러오는 중...</p>
	{:else}
		<div class="mb-5 flex items-center gap-3 px-1 text-[12px] text-[var(--color-text-secondary)]">
			<span class="font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
				{pkg.translation_name}
			</span>
			<span class="h-3 w-px bg-[var(--color-border)]" aria-hidden="true"></span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-px w-4 bg-[var(--color-accent)]/60"></span>
				{verses.length}개 구절
			</span>
		</div>
		<GroupList {packageId} {verses} />
	{/if}
</main>
