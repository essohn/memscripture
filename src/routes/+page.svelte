<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageCard from '$lib/components/PackageCard.svelte';
	import { listPackages } from '$lib/db/verses';
	import { getRecentPackageIds } from '$lib/db/recent';
	import type { PackageMeta } from '$lib/types';
	import { Sparkles } from 'lucide-svelte';

	let packages: PackageMeta[] = $state([]);
	let recentIds: string[] = $state([]);

	$effect(() => {
		Promise.all([listPackages(), getRecentPackageIds()])
			.then(([p, ids]) => {
				packages = p;
				recentIds = ids;
			})
			.catch(() => {});
	});

	const today = new Intl.DateTimeFormat('ko-KR', {
		month: 'long',
		day: 'numeric',
		weekday: 'long'
	}).format(new Date());
</script>

<Header title={today} />

<main class="mx-auto max-w-md px-5 pb-8 pt-6">
	<section
		class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-6 pb-7 pt-8"
	>
		<span
			class="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[var(--color-accent-soft)] opacity-70 blur-2xl"
			aria-hidden="true"
		></span>

		<div
			class="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
		>
			<Sparkles size={12} class="text-[var(--color-accent)]" />
			Today
		</div>

		<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
			오늘은 학습할 구절이<br />아직 없어요
		</h2>
		<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
			SRS 복습은 곧 추가됩니다. 그 전에<br />아래 패키지를 먼저 둘러보세요.
		</p>
	</section>

	<div class="mt-8 mb-3 flex items-baseline justify-between px-1">
		<h3 class="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
			추천 패키지
		</h3>
		<a
			href="/library"
			class="text-[12px] font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
		>
			전체 보기 →
		</a>
	</div>

	<div class="space-y-3">
		{#each packages.slice(0, 3) as pkg (pkg.id)}
			<PackageCard {pkg} recent={recentIds.includes(pkg.id)} />
		{/each}
	</div>
</main>

<style>
	.hero-card {
		box-shadow: var(--shadow-card);
	}
</style>
