<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import PackageCard from '$lib/components/PackageCard.svelte';
	import { listPackages, listVerses } from '$lib/db/verses';
	import { getRecentPackageIds } from '$lib/db/recent';
	import { getActivePackageId } from '$lib/db/activePackage';
	import { listProgressByPackage } from '$lib/db/progress';
	import { getActivityHistory } from '$lib/db/activity';
	import { applyGraduations } from '$lib/srs/orchestrate';
	import { buildTodayQueue } from '$lib/srs/scheduler';
	import { buildSuggestions } from '$lib/srs/suggestions';
	import type { PackageMeta } from '$lib/types';
	import { Sparkles } from 'lucide-svelte';

	let packages: PackageMeta[] = $state([]);
	let recentIds: string[] = $state([]);
	let activePackageId: string | null = $state(null);
	let queueLen = $state(0);
	let newCount = $state(0);
	let reviewCount = $state(0);
	let suggestionCount = $state(0);
	let allMemorized = $state(false);

	$effect(() => {
		(async () => {
			const [pkgs, recent, activeId] = await Promise.all([
				listPackages(),
				getRecentPackageIds(),
				getActivePackageId()
			]);
			packages = pkgs;
			recentIds = recent;
			activePackageId = activeId;
			if (!activeId) return;

			const [progress, packageVerses, activity] = await Promise.all([
				listProgressByPackage(activeId),
				listVerses(activeId),
				getActivityHistory()
			]);
			const { current } = applyGraduations(progress);
			const queue = buildTodayQueue(current, activity);
			const suggestions = buildSuggestions(current, packageVerses);
			queueLen = queue.length;
			newCount = queue.filter((p) => p.bucket === 'new').length;
			reviewCount = queue.length - newCount;
			suggestionCount = suggestions.length;
			allMemorized = packageVerses.length > 0 && suggestions.length === 0 && queue.length === 0;
		})().catch(() => {});
	});

	const today = new Intl.DateTimeFormat('ko-KR', {
		month: 'long',
		day: 'numeric',
		weekday: 'long'
	}).format(new Date());

	const heroState = $derived(
		!activePackageId
			? 'no-active'
			: allMemorized
				? 'all-done-package'
				: queueLen + suggestionCount === 0
					? 'all-done-today'
					: 'has-queue'
	);
</script>

<Header title={today} />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
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

		{#if heroState === 'no-active'}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				학습할 패키지를 골라보세요
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				라이브러리에서 패키지를 열고<br />「이 패키지로 학습 시작」을 누르세요.
			</p>
			<a
				href="/library"
				class="relative mt-6 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				라이브러리로 →
			</a>
		{:else if heroState === 'has-queue'}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				{queueLen + suggestionCount}장 남음
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				{#if newCount > 0 || reviewCount > 0}
					새 {newCount} · 복습 {reviewCount}{#if suggestionCount > 0} · 추천 {suggestionCount}{/if}
				{:else if suggestionCount > 0}
					추천 구절 {suggestionCount}장
				{/if}
			</p>
			<a
				href="/today"
				class="relative mt-6 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				시작 →
			</a>
		{:else if heroState === 'all-done-today'}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				🎉 오늘은 다 했어요
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				내일 다시 만나요.
			</p>
		{:else}
			<h2 class="relative mt-4 text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				이 패키지를 다 외웠어요
			</h2>
			<p class="relative mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				다른 패키지를 시작해 보세요.
			</p>
			<a
				href="/library"
				class="relative mt-6 inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				라이브러리로 →
			</a>
		{/if}
	</section>

	<div class="mt-8 mb-3 flex items-baseline justify-between px-1">
		<h3
			class="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]"
		>
			최근 패키지
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
