<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import ReviewCard from '$lib/components/srs/ReviewCard.svelte';
	import SuggestionCard from '$lib/components/srs/SuggestionCard.svelte';
	import QueueProgress from '$lib/components/srs/QueueProgress.svelte';
	import { goto } from '$app/navigation';
	import { upsertProgress, pushRating, progressId } from '$lib/db/progress';
	import type { VerseProgress } from '$lib/types';
	import type { TodayLoadData } from './+page';

	let { data }: { data: TodayLoadData } = $props();

	type QueueItem =
		| { kind: 'review'; progress: VerseProgress }
		| { kind: 'suggest'; packageId: string; verseNo: number };

	const verseByNo = $derived(new Map(data.packageVerses.map((v) => [v.no, v])));

	let items = $state<QueueItem[]>(
		[
			...data.queue.map((p): QueueItem => ({ kind: 'review', progress: p })),
			...data.suggestions.map(
				(s): QueueItem => ({ kind: 'suggest', packageId: s.packageId, verseNo: s.verseNo })
			)
		]
	);

	let index = $state(0);
	let cardKey = $state(0); // bumps to force ReviewCard remount per item

	const current = $derived(items[index]);
	const isDone = $derived(index >= items.length);
	const total = items.length;

	function next() {
		index += 1;
		cardKey += 1;
	}

	async function onCiteRated(score: number) {
		if (!current || current.kind !== 'review') return;
		await pushRating(
			current.progress.packageId,
			current.progress.verseNo,
			'cite',
			score
		).catch(() => {});
	}

	async function onRecallRated(score: number) {
		if (!current || current.kind !== 'review') return;
		await pushRating(
			current.progress.packageId,
			current.progress.verseNo,
			'recall',
			score
		).catch(() => {});
		next();
	}

	async function onCommitSuggestion() {
		if (!current || current.kind !== 'suggest') return;
		const fresh: VerseProgress = {
			id: progressId(current.packageId, current.verseNo),
			packageId: current.packageId,
			verseNo: current.verseNo,
			bucket: 'new',
			enteredBucketAt: Date.now(),
			daysActiveInBucket: 0,
			lastReviewedAt: 0,
			citeRatings: [],
			recallRatings: []
		};
		await upsertProgress(fresh).catch(() => {});
		next();
	}

	function onSkipSuggestion() {
		next();
	}
</script>

<Header title="오늘" onBack={() => goto('/')} />

<main class="mx-auto max-w-2xl px-5 pb-12 pt-4">
	{#if isDone}
		<section
			class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<h2 class="text-[24px] font-semibold leading-tight text-[var(--color-text)]">
				🎉 오늘은 다 했어요
			</h2>
			<p class="mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				총 {total}장 완료
			</p>
			<button
				type="button"
				onclick={() => goto('/')}
				class="mt-7 inline-flex items-center rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
			>
				홈으로
			</button>
		</section>
	{:else if total === 0}
		<section
			class="hero-card relative overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-12 text-center"
		>
			<h2 class="text-[20px] font-semibold leading-tight text-[var(--color-text)]">
				오늘은 카드가 없어요
			</h2>
			<p class="mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
				활성 패키지를 다 외웠거나, 추가할 New 슬롯이 가득찼습니다.
			</p>
		</section>
	{:else}
		<div class="mb-4 flex items-center justify-center">
			<QueueProgress current={index + 1} {total} />
		</div>

		{#key cardKey}
			{#if current && current.kind === 'review'}
				{@const v = verseByNo.get(current.progress.verseNo)}
				{#if v}
					<ReviewCard verse={v} {onCiteRated} {onRecallRated} />
				{/if}
			{:else if current && current.kind === 'suggest'}
				{@const v = verseByNo.get(current.verseNo)}
				{#if v}
					<SuggestionCard verse={v} oncommit={onCommitSuggestion} onskip={onSkipSuggestion} />
				{/if}
			{/if}
		{/key}
	{/if}
</main>

<style>
	.hero-card {
		box-shadow: var(--shadow-card);
	}
</style>
