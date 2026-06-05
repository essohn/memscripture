<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { Sparkles, X } from 'lucide-svelte';
	import {
		listRecentBundles,
		deleteRecentBundle,
		clearRecentBundles,
		restoreRecentBundle
	} from '$lib/db/recentBundles';
	import { listPackages, loadPackageData } from '$lib/db/verses';
	import type { PackageMeta } from '$lib/types';
	import type { StoredVerse } from '$lib/db/local';

	interface BundleRow {
		id: string;
		packageId: string;
		verseNos: number[];
		seriesIndex: number | null;
		groupIndices: number[];
		createdAt: number;
		frontVerse: StoredVerse | null;
		packageAbbreviation: string;
	}

	let rows = $state<BundleRow[]>([]);
	let loaded = $state(false);
	let editMode = $state(false);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	$effect(() => {
		let active = true;
		(async () => {
			const bundles = await listRecentBundles(10);
			if (bundles.length === 0) {
				if (active) {
					rows = [];
					loaded = true;
				}
				return;
			}

			// listPackages triggers the OYO seed + curated fetch, so resolving the
			// abbreviation here doubles as the install step.
			const allPackages = await listPackages();
			const pkgById = new Map<string, PackageMeta>(allPackages.map((p) => [p.id, p]));

			// Load each referenced package's verse data once to resolve front verses.
			const uniquePackageIds = Array.from(new Set(bundles.map((b) => b.packageId)));
			const dataByPkg = new Map(
				await Promise.all(
					uniquePackageIds.map(
						async (id) => [id, await loadPackageData(id).catch(() => null)] as const
					)
				)
			);

			const resolved: BundleRow[] = bundles.map((b) => {
				const pkgData = dataByPkg.get(b.packageId);
				const frontVerse = pkgData?.verses.find((v) => v.no === b.verseNos[0]) ?? null;
				return {
					id: b.id,
					packageId: b.packageId,
					verseNos: b.verseNos,
					seriesIndex: b.seriesIndex ?? null,
					groupIndices: b.groupIndices ?? [],
					createdAt: b.createdAt,
					frontVerse,
					packageAbbreviation: pkgById.get(b.packageId)?.abbreviation ?? b.packageId
				};
			});

			if (active) {
				// Drop bundles whose front verse no longer exists (package uninstalled
				// or renumbered) — better to omit than show a broken card.
				rows = resolved.filter((r) => r.frontVerse !== null);
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

	// Link that restores both the selection (?sel) and the package filter (?s/?g)
	// captured when the bundle was committed.
	function bundleHref(row: BundleRow): string {
		const params = new URLSearchParams();
		params.set('sel', row.verseNos.join(','));
		if (row.seriesIndex !== null && row.seriesIndex !== undefined) {
			params.set('s', String(row.seriesIndex));
		}
		if (row.groupIndices.length > 0) params.set('g', row.groupIndices.join(','));
		return `/library/${row.packageId}?${params.toString()}`;
	}

	// Strip the resolved view-model fields back to the stored bundle shape. Arrays
	// must be plain copies — `row.verseNos`/`row.groupIndices` are Svelte $state
	// proxies, and IndexedDB can't structured-clone a Proxy (put would throw and
	// be swallowed by the .catch).
	function toBundle(row: BundleRow) {
		return {
			id: row.id,
			packageId: row.packageId,
			verseNos: [...row.verseNos],
			seriesIndex: row.seriesIndex,
			groupIndices: [...row.groupIndices],
			createdAt: row.createdAt
		};
	}

	// Optimistic delete + undo, mirroring the bookmarks page. Re-inserts preserve
	// the original createdAt so undo restores the bundle in its place.
	async function deleteBundle(row: BundleRow) {
		rows = rows.filter((r) => r.id !== row.id);
		if (rows.length === 0) editMode = false;
		await deleteRecentBundle(row.id).catch(() => {});
		toast = {
			message: '묶음을 지웠습니다',
			actionLabel: '실행 취소',
			onAction: async () => {
				rows = [...rows, row].sort((a, b) => b.createdAt - a.createdAt);
				await restoreRecentBundle(toBundle(row)).catch(() => {});
			}
		};
	}

	async function clearAll() {
		const removed = rows;
		if (removed.length === 0) return;
		rows = [];
		editMode = false;
		await clearRecentBundles().catch(() => {});
		toast = {
			message: `최근 ${removed.length}개를 지웠습니다`,
			actionLabel: '실행 취소',
			onAction: async () => {
				rows = [...removed];
				await Promise.all(removed.map((r) => restoreRecentBundle(toBundle(r)).catch(() => {})));
			}
		};
	}
</script>

<Header title="Home" />

<main class="mx-auto max-w-2xl px-5 pb-8 pt-6">
	<section class="flex items-center justify-between gap-3 px-1">
		<div
			class="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
		>
			<Sparkles size={13} class="text-[var(--color-accent)]" />
			최근
		</div>
		{#if loaded && rows.length > 0}
			{#if editMode}
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={clearAll}
						class="text-[12px] font-medium text-[var(--color-danger)] underline-offset-4 hover:underline"
					>
						전체 지우기
					</button>
					<button
						type="button"
						onclick={() => (editMode = false)}
						class="text-[12px] font-medium text-[var(--color-accent)]"
					>
						완료
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (editMode = true)}
					class="text-[12px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text)]"
				>
					편집
				</button>
			{/if}
		{/if}
	</section>

	<div class="mt-6 px-1">
		{#if !loaded}
			<p class="text-[13px] text-[var(--color-text-tertiary)]">불러오는 중…</p>
		{:else if rows.length === 0}
			<section
				class="empty-card rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
			>
				<p class="text-[15px] text-[var(--color-text-secondary)]">아직 최근에 담은 구절이 없습니다.</p>
				<p class="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
					구절 리스트에서 구절을 선택해 담으면 여기에 묶음으로 표시됩니다.
				</p>
			</section>
		{:else}
			<ul class="space-y-4">
				{#each rows as row (row.id)}
					{@const count = row.verseNos.length}
					<li class="relative">
						<!-- Stack layers peeking behind the card hint at a multi-verse bundle. -->
						{#if count > 1}
							<span class="deck deck-1" aria-hidden="true"></span>
							{#if count > 2}
								<span class="deck deck-2" aria-hidden="true"></span>
							{/if}
						{/if}
						<a
							href={bundleHref(row)}
							onclick={(e) => {
								if (editMode) e.preventDefault();
							}}
							class="recent-card relative block rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 transition-all hover:border-[var(--color-accent)]/50"
						>
							<div class="flex items-center justify-between gap-2">
								<p
									class="text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
								>
									{row.packageAbbreviation}
								</p>
								{#if editMode}
									<button
										type="button"
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											deleteBundle(row);
										}}
										aria-label="이 묶음 지우기"
										class="-mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-danger)]"
									>
										<X size={16} />
									</button>
								{:else}
									<p class="text-[11px] text-[var(--color-text-tertiary)]">
										{relativeTimeKo(row.createdAt)}
									</p>
								{/if}
							</div>
							<div class="mt-1.5 flex items-center justify-between gap-3">
								<h3 class="truncate text-[16px] font-semibold text-[var(--color-text)]">
									{row.frontVerse?.title}
								</h3>
								{#if count > 1}
									<span
										class="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--color-accent)]"
									>
										{count}구절
									</span>
								{/if}
							</div>
							<p class="mt-1 text-[12px] text-[var(--color-text-secondary)]">
								{row.frontVerse?.cite}{count > 1 ? ` 외 ${count - 1}구절` : ''}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}

<style>
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
	/* Deck layers sit behind the card, narrower and nudged down so they peek out
	   at the bottom like a stack of cards. */
	.deck {
		position: absolute;
		bottom: 0;
		top: 0;
		border-radius: 16px;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		box-shadow: var(--shadow-soft);
	}
	.deck-1 {
		left: 8px;
		right: 8px;
		transform: translateY(6px);
	}
	.deck-2 {
		left: 16px;
		right: 16px;
		transform: translateY(12px);
	}
</style>
