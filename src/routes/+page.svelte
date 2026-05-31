<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { Sparkles } from 'lucide-svelte';
	import { listRecentVerses } from '$lib/db/recentVerses';
	import { listPackages, loadPackageData } from '$lib/db/verses';
	import type { PackageMeta } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	interface RecentRow {
		packageId: string;
		verseNo: number;
		viewedAt: number;
		verse: StoredVerse | null;
		packageAbbreviation: string;
	}

	let rows = $state<RecentRow[]>([]);
	let loaded = $state(false);

	$effect(() => {
		let active = true;
		(async () => {
			const recents = await listRecentVerses(10);
			if (recents.length === 0) {
				if (active) {
					rows = [];
					loaded = true;
				}
				return;
			}

			// Resolve verse + package abbreviation for each entry. listPackages
			// triggers the OYO seed + curated fetch, so we don't need a separate
			// install step.
			const allPackages = await listPackages();
			const pkgById = new Map<string, PackageMeta>(allPackages.map((p) => [p.id, p]));

			// Load each referenced package's verse data once.
			const uniquePackageIds = Array.from(new Set(recents.map((r) => r.packageId)));
			const dataByPkg = new Map(
				await Promise.all(
					uniquePackageIds.map(
						async (id) => [id, await loadPackageData(id).catch(() => null)] as const
					)
				)
			);

			const resolved: RecentRow[] = recents.map((r) => {
				const pkgData = dataByPkg.get(r.packageId);
				const verse = pkgData?.verses.find((v) => v.no === r.verseNo) ?? null;
				return {
					packageId: r.packageId,
					verseNo: r.verseNo,
					viewedAt: r.viewedAt,
					verse,
					packageAbbreviation: pkgById.get(r.packageId)?.abbreviation ?? r.packageId
				};
			});

			if (active) {
				// Drop rows whose verse no longer exists (package uninstalled or
				// verse renumbered) — better to omit than show a broken card.
				rows = resolved.filter((r) => r.verse !== null);
				loaded = true;
			}
		})().catch(() => {
			if (active) loaded = true;
		});
		return () => {
			active = false;
		};
	});

	function relativeTimeKo(ms: number): string {
		const delta = Date.now() - ms;
		const min = Math.floor(delta / 60_000);
		if (min < 1) return '방금 전';
		if (min < 60) return `${min}분 전`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}시간 전`;
		const day = Math.floor(hr / 24);
		if (day < 7) return `${day}일 전`;
		return `${Math.floor(day / 7)}주 전`;
	}
</script>

<Header title="Home" />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	<section
		class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-6 pb-6 pt-7"
	>
		<span
			class="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[var(--color-accent-soft)] opacity-70 blur-2xl"
			aria-hidden="true"
		></span>
		<div
			class="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
		>
			<Sparkles size={12} class="text-[var(--color-accent)]" />
			최근
		</div>
		<h2 class="relative mt-4 text-[20px] font-semibold leading-tight text-[var(--color-text)]">
			보던 구절로 돌아가기
		</h2>
		<p class="relative mt-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
			최근에 열어본 구절을 탭하면 그 구절로 바로 이동합니다.
		</p>
	</section>

	<div class="mt-6 px-1">
		{#if !loaded}
			<p class="text-[13px] text-[var(--color-text-tertiary)]">불러오는 중…</p>
		{:else if rows.length === 0}
			<section
				class="empty-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
			>
				<p class="text-[15px] text-[var(--color-text-secondary)]">
					아직 본 구절이 없습니다.
				</p>
				<p class="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
					Library에서 구절을 열면 여기에 표시됩니다.
				</p>
			</section>
		{:else}
			<ul class="space-y-3">
				{#each rows as row (`${row.packageId}:${row.verseNo}`)}
					<li>
						<a
							href={`/library/${row.packageId}/${row.verseNo}`}
							class="recent-card group block rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 transition-all hover:border-[var(--color-accent)]/50"
						>
							<div class="flex items-baseline justify-between gap-2">
								<p
									class="text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
								>
									{row.packageAbbreviation}
								</p>
								<p class="text-[11px] text-[var(--color-text-tertiary)]">
									{relativeTimeKo(row.viewedAt)}
								</p>
							</div>
							{#if row.verse?.title}
								<h3
									class="mt-1.5 truncate text-[16px] font-semibold text-[var(--color-text)]"
								>
									{row.verse.title}
								</h3>
							{/if}
							<p class="mt-1 text-[12px] text-[var(--color-text-secondary)]">
								{row.verse?.cite}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>

<style>
	.hero-card,
	.empty-card {
		box-shadow: var(--shadow-soft);
	}
	.recent-card {
		box-shadow: var(--shadow-soft);
		transition:
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1),
			border-color 240ms ease;
	}
	.recent-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-card-hover);
	}
</style>
