<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { listPackages } from '$lib/db/verses';
	import type { PackageMeta } from '$lib/types';
	import { BookOpen } from 'lucide-svelte';

	let packages: PackageMeta[] = $state([]);

	$effect(() => {
		listPackages()
			.then((p) => (packages = p))
			.catch(() => {});
	});

	const today = new Intl.DateTimeFormat('ko-KR', {
		month: 'long',
		day: 'numeric',
		weekday: 'long'
	}).format(new Date());
</script>

<Header title={today} />

<main class="max-w-md mx-auto px-5 pt-12 pb-8 text-center space-y-6">
	<div class="flex justify-center text-[var(--color-text-tertiary)]">
		<BookOpen size={48} strokeWidth={1.25} />
	</div>
	<div class="space-y-2">
		<h2 class="text-xl font-semibold">오늘은 학습할 구절이 없어요</h2>
		<p class="text-sm text-[var(--color-text-secondary)]">
			Phase 3에서 SRS가 추가되면 매일 복습할 구절이 여기에 나타나요.
		</p>
		<p class="text-sm text-[var(--color-text-secondary)]">그 전에 먼저 패키지를 둘러볼까요?</p>
	</div>
	<div class="space-y-2">
		{#each packages.slice(0, 3) as pkg (pkg.id)}
			<a
				href={`/library/${pkg.id}`}
				class="block bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl
				       px-4 py-3 text-left hover:bg-[var(--color-elevated)]"
			>
				<span class="font-medium">{pkg.name}</span>
				<span class="text-[var(--color-text-tertiary)] float-right">→</span>
			</a>
		{/each}
	</div>
	<a
		href="/library"
		class="inline-block text-sm text-[var(--color-accent)] underline-offset-4 hover:underline"
	>
		Library 전체 둘러보기
	</a>
</main>
