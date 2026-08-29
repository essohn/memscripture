<script lang="ts">
	import type { CheckRecord } from '$lib/db/local';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import DifficultyDot from './DifficultyDot.svelte';
	import {
		MIN_RECORDS,
		accuracySeries,
		difficultyTrend,
		effortTotals,
		wordHeat,
		type HeatTier,
		type Trend
	} from '$lib/memorize/diagnosis';

	interface Props {
		/** 점검 records, newest first — the same array the sheet lists below.
		 *  Deliberately the same, not a wider window: a summary that disagreed
		 *  with what it summarises is worse than no summary. */
		records: CheckRecord[];
		/** The verse's words, split exactly as markMismatchedWords indexes
		 *  them, so a tint lands on the word it describes. */
		words: string[];
	}
	let { records, words }: Props = $props();

	const shown = $derived(records.length >= MIN_RECORDS);
	const effort = $derived(effortTotals(records));
	const series = $derived(accuracySeries(records));
	const heat = $derived(wordHeat(records, words.length));

	/** Whether any record measured word positions at all. A history written
	 *  entirely before `missed` existed can still speak about effort and
	 *  difficulty, but has nothing to say about where the verse breaks. */
	const hasHeat = $derived(heat.some((h) => h.reached > 0));

	/** Oldest first, so a row of pips reads the same direction as the bars
	 *  above it and as time itself. */
	const chronological = $derived([...records].reverse());

	const DIMS = [
		{ dim: 'start' as const, label: '첫 시작' },
		{ dim: 'full' as const, label: '전체' }
	];

	const TRENDS: Record<Trend, string> = {
		improving: '↗ 쉬워지는 중',
		flat: '→ 그대로',
		worsening: '↘ 어려워지는 중',
		unknown: ''
	};

	const TIER_CLASS: Record<HeatTier, string> = {
		none: '',
		rare: 'heat-rare',
		sometimes: 'heat-sometimes',
		often: 'heat-often'
	};

	const TIER_LABEL: Record<HeatTier, string> = {
		none: '',
		rare: '드물게',
		sometimes: '가끔',
		often: '자주'
	};

	/**
	 * Bar height as a percent of the plot, floored so a bad check still draws.
	 *
	 * The ceiling is fixed at 1 rather than the series maximum, unlike
	 * EventStats: accuracy is already a proportion, and rescaling it to its own
	 * best value would draw a run of 40/45/50% as a climb to the top of the box.
	 * The floor is EventStats' idea though — a 4% check rendered true to scale
	 * is a fraction of a pixel, indistinguishable from a check that never
	 * happened.
	 */
	const MIN_BAR_PCT = 12;
	function barPct(accuracy: number): number {
		return Math.max(MIN_BAR_PCT, Math.min(1, Math.max(0, accuracy)) * 100);
	}

	function durationKo(ms: number): string {
		const seconds = Math.round(ms / 1000);
		return seconds < 60 ? `${seconds}초` : `${Math.round(seconds / 60)}분`;
	}

	const accuracyLabel = $derived(
		`정확도 변화: ${series.map((a) => `${Math.round(a * 100)}%`).join(', ')}`
	);

	function sequenceLabel(dim: 'start' | 'full'): string {
		return `${DIMS.find((d) => d.dim === dim)!.label} 난이도 변화: ${chronological
			.map((r) => r[dim] ?? '없음')
			.join(', ')}`;
	}

	/**
	 * The tinted words, named once after the verse rather than annotated one
	 * by one inside it.
	 *
	 * A role="img" on the paragraph would make its own word labels
	 * unreachable, and a bare span's aria-label is not reliably announced —
	 * CheckHistorySheet's pip comment already warns of exactly that. So the
	 * verse stays readable text and this sentence carries the diagnosis.
	 */
	const heatSummary = $derived(
		(['often', 'sometimes', 'rare'] as const)
			.map((tier) => ({
				tier,
				hit: words.filter((_, i) => heat[i]?.tier === tier)
			}))
			.filter((g) => g.hit.length > 0)
			.map((g) => `${TIER_LABEL[g.tier]} 틀린 곳: ${g.hit.join(', ')}.`)
			.join(' ')
	);
</script>

{#if shown}
	<div
		data-testid="check-diagnosis"
		class="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"
	>
		<p
			data-testid="diagnosis-effort"
			class="text-[11px] tabular-nums text-[var(--color-text-secondary)]"
		>최근 {effort.checks}회 {#if effort.hints}· 힌트 {effort.hints}{/if} · {durationKo(effort.ms)}</p>

		<div class="mt-2 flex items-center gap-2">
			<span class="w-9 shrink-0 text-[11px] text-[var(--color-text-tertiary)]">정확도</span>
			<div role="img" aria-label={accuracyLabel} class="flex h-6 flex-1 items-end gap-[3px]">
				{#each series as accuracy, i (i)}
					<span
						data-testid="accuracy-bar"
						class="min-w-[3px] flex-1 rounded-sm bg-[var(--color-accent)]"
						style="height: {barPct(accuracy)}%"
					></span>
				{/each}
			</div>
		</div>

		{#each DIMS as d (d.dim)}
			{@const trend = difficultyTrend(records, d.dim)}
			<div class="mt-2 flex items-center gap-2">
				<span class="w-9 shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{d.label}</span>
				<span
					role="img"
					aria-label={sequenceLabel(d.dim)}
					class="flex min-w-0 flex-1 flex-wrap items-center gap-1"
				>
					{#each chronological as r (r.id)}
						<DifficultyDot value={r[d.dim] as DifficultyLevel | null} />
					{/each}
				</span>
				{#if trend !== 'unknown'}
					<span
						data-testid="trend-{d.dim}"
						class="shrink-0 text-[11px] text-[var(--color-text-secondary)]"
					>{TRENDS[trend]}</span>
				{/if}
			</div>
		{/each}

		{#if hasHeat}
			<p
				data-testid="diagnosis-heatmap"
				class="mt-3 break-keep border-t border-[var(--color-border)] pt-2.5 text-[13px] leading-[2] text-[var(--color-text)]"
			>{#each words as word, i (i)}<span
					data-testid="heat-word"
					data-tier={heat[i].tier}
					class="rounded-sm px-0.5 {TIER_CLASS[heat[i].tier]}"
				>{word}</span>{' '}{/each}</p>

			<!-- Tailwind's sr-only — off-screen rather than hidden, because
			     display:none and visibility:hidden are both skipped by screen
			     readers and would leave the tints with no textual equivalent at
			     all. Already used this way in library/[packageId] and
			     oyo/import/table. -->
			<p class="sr-only">{heatSummary}</p>

			<p class="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]" aria-hidden="true">
				<span class="heat-often rounded-sm px-1">자주</span>
				<span class="heat-sometimes rounded-sm px-1">가끔</span>
				<span class="heat-rare rounded-sm px-1">드물게</span>
				틀린 곳
			</p>
		{/if}
	</div>
{/if}

<style>
	/* Static class names, not an interpolated var(--color-heat-{tier}):
	   Tailwind v4 shakes out tokens its scanner cannot see, and these three
	   are declared in plain :root beside the ribbon palette for the same
	   reason. */
	.heat-often {
		background-color: var(--color-heat-often);
	}
	.heat-sometimes {
		background-color: var(--color-heat-sometimes);
	}
	.heat-rare {
		background-color: var(--color-heat-rare);
	}
</style>
