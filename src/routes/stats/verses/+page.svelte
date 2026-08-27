<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { verseVisibility } from '$lib/state/verseVisibility.svelte';
	import { fontScale } from '$lib/state/fontScale.svelte';
	import {
		getVerseRating,
		setStartDifficulty,
		setFullDifficulty,
		DIFFICULTY_LABELS,
		type DifficultyLevel
	} from '$lib/db/verseRatings';
	import { ratedLevel } from '$lib/db/events';
	import type { StatsVersesLoadData } from './+page';

	let { data }: { data: StatsVersesLoadData } = $props();

	const showVerseText = $derived(verseVisibility.shown);

	// Composite-keyed, like the bookmarks list: this page spans packages, so a
	// verse number alone is not unique.
	let startDifficulties = $state<Record<string, DifficultyLevel | null>>({});
	let fullDifficulties = $state<Record<string, DifficultyLevel | null>>({});

	function ratingKey(packageId: string, verseNo: number): string {
		return `${packageId}:${verseNo}`;
	}

	const dimLabel = $derived(data.dim === 'start' ? '시작' : '전체');
	const heading = $derived(
		data.level === null
			? `${dimLabel} 난이도 미평가`
			: `${dimLabel} 난이도 ${data.level} · ${DIFFICULTY_LABELS[data.level]}`
	);

	$effect(() => {
		const rows = data.rows;
		void (async () => {
			const ratings = await Promise.all(
				rows.map((r) => getVerseRating(r.packageId, r.verse.no))
			);
			const start: Record<string, DifficultyLevel | null> = {};
			const full: Record<string, DifficultyLevel | null> = {};
			rows.forEach((r, i) => {
				const key = ratingKey(r.packageId, r.verse.no);
				start[key] = ratedLevel(ratings[i], 'start');
				full[key] = ratedLevel(ratings[i], 'full');
			});
			startDifficulties = start;
			fullDifficulties = full;
		})();
	});

	/**
	 * Rating from this screen is deliberately not re-filtered.
	 *
	 * The list is the answer to a question asked on the home page. Re-running
	 * that query as the reader rates would make cards vanish under the finger
	 * that just rated them, and a list that empties itself is a worse place to
	 * work than one that goes briefly stale.
	 */
	function pickStart(packageId: string, verseNo: number, level: DifficultyLevel | null) {
		startDifficulties = { ...startDifficulties, [ratingKey(packageId, verseNo)]: level };
		setStartDifficulty(packageId, verseNo, level).catch(() => {});
	}

	function pickFull(packageId: string, verseNo: number, level: DifficultyLevel | null) {
		fullDifficulties = { ...fullDifficulties, [ratingKey(packageId, verseNo)]: level };
		setFullDifficulty(packageId, verseNo, level).catch(() => {});
	}

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else location.href = '/';
	}
</script>

<Header title={heading} onBack={goBack} />

<main class="mx-auto max-w-2xl px-5 pb-24 pt-4">
	{#if data.rows.length === 0}
		<p class="pt-12 text-center text-[var(--color-text-tertiary)]">
			해당하는 구절이 없습니다.
		</p>
	{:else}
		<p class="mb-4 px-1 text-[12px] text-[var(--color-text-secondary)]">
			{data.eventTitle} · <span class="tabular-nums">{data.rows.length}</span>구절
		</p>
		<div class="space-y-5">
			{#each data.rows as row (ratingKey(row.packageId, row.verse.no))}
				<VerseCard
					verse={row.verse}
					packageName={row.packageName}
					packageId={row.packageId}
					startDifficulty={startDifficulties[ratingKey(row.packageId, row.verse.no)] ?? null}
					fullDifficulty={fullDifficulties[ratingKey(row.packageId, row.verse.no)] ?? null}
					onPickStartDifficulty={(l) => pickStart(row.packageId, row.verse.no, l)}
					onPickFullDifficulty={(l) => pickFull(row.packageId, row.verse.no, l)}
					showBody={showVerseText}
					fontScale={fontScale.value}
				/>
			{/each}
		</div>
	{/if}
</main>
