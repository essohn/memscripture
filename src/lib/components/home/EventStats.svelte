<script lang="ts">
	import { PartyPopper } from 'lucide-svelte';
	import {
		DIFFICULTY_COLORS,
		DIFFICULTY_LABELS,
		DIFFICULTY_LEVELS,
		type DifficultyLevel
	} from '$lib/db/verseRatings';
	import {
		DIMENSION_LABELS,
		hasEventStats,
		statsPerfectHref,
		statsVersesHref,
		type EventStats
	} from '$lib/db/events';

	interface Props {
		stats: EventStats;
		/** Needed only to build the links out of the chart — the page they open
		 *  re-resolves the verses from it rather than being handed a list. */
		eventId: string;
	}
	let { stats, eventId }: Props = $props();

	/** Plot height in px, and the shortest bar a non-zero count may draw.
	 *  Sized in px rather than percent so the floor is expressible at all: a
	 *  percentage of an unknown box cannot promise to stay visible. */
	const PLOT_PX = 34;
	const MIN_BAR_PX = 4;

	const SERIES = [
		{ key: 'start' as const, label: DIMENSION_LABELS.start },
		{ key: 'full' as const, label: DIMENSION_LABELS.full }
	];

	/** Nothing rated and nothing recited means nothing to plot. An empty chart
	 *  would sit on the home page claiming the reader has been measured, when
	 *  what it really shows is that the event is new. */
	const empty = $derived(!hasEventStats(stats));

	/** One ceiling for both charts. Scaled apart, counts of 2 and 4 would draw
	 *  the same bar, and comparing the two shapes is the whole reason they sit
	 *  side by side. */
	const ceiling = $derived(Math.max(1, ...stats.start, ...stats.full));

	function countsOf(key: 'start' | 'full'): number[] {
		return key === 'start' ? stats.start : stats.full;
	}

	/**
	 * Bar height in px, floored so one verse never draws a hairline.
	 *
	 * Against a tall ceiling a count of one is a fraction of a pixel, and a
	 * fraction of a pixel is indistinguishable from the empty slot beside it.
	 * The floor costs a little accuracy and buys back the only comparison that
	 * bar has to make — one versus none.
	 */
	function barPx(count: number): number {
		if (count === 0) return 0;
		return Math.max(MIN_BAR_PX, (count / ceiling) * PLOT_PX);
	}

	/** Verses the five bars do not account for: rated on neither end of this
	 *  dimension. Clamped because the total and the histogram are separate
	 *  reads, and a negative remainder is not a thing to print at anyone. */
	/** Verses whose last check was not flawless — including the ones never
	 *  checked at all. Same shape as `unrated` below: total minus the ones that
	 *  qualify, so the panel's five numbers all mean the same kind of thing. */
	const imperfect = $derived(Math.max(0, stats.total - stats.perfect));

	function unrated(key: 'start' | 'full'): number {
		const rated = countsOf(key).reduce((a, b) => a + b, 0);
		return Math.max(0, stats.total - rated);
	}
</script>

{#if !empty}
	<div class="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-3">
		<!-- One headline figure, not a one-bar chart: a single magnitude reads
		     faster as a number, and it needs the total beside it to mean
		     anything at all. -->
		<!-- One sentence at one size. The 19px number beside 11px labels read as
		     two separate facts; these are one. The anchors keep a 44px minimum
		     even though the text is 12px — the hit area is not the type size,
		     and wrapping just the digits measured 12x31 and 47x17. -->
		<div data-testid="headline" class="flex flex-wrap items-center text-[12px]">
			<PartyPopper size={13} class="mr-1.5 shrink-0 text-[var(--color-accent)]" />
			<svelte:element
				this={stats.perfect > 0 ? 'a' : 'span'}
				href={stats.perfect > 0 ? statsPerfectHref(eventId, true) : undefined}
				class="flex min-h-[44px] items-center gap-1 rounded-md px-1 {stats.perfect > 0
					? 'transition-colors hover:bg-[var(--color-elevated)]'
					: ''}"
			>
				<span class="text-[12px] text-[var(--color-text-secondary)]">완벽</span>
				<span
					data-testid="perfect-count"
					class="text-[12px] font-semibold tabular-nums text-[var(--color-text)]"
				>
					{stats.perfect}
				</span>
			</svelte:element><span
				class="-ml-1 mr-1 text-[12px] text-[var(--color-text-tertiary)]">,</span
			><svelte:element
				this={imperfect > 0 ? 'a' : 'span'}
				href={imperfect > 0 ? statsPerfectHref(eventId, false) : undefined}
				class="flex min-h-[44px] items-center gap-1 rounded-md px-1 {imperfect > 0
					? 'transition-colors hover:bg-[var(--color-elevated)]'
					: ''}"
			>
				<span class="text-[12px] text-[var(--color-text-secondary)]">미완벽</span>
				<span
					data-testid="imperfect-count"
					class="text-[12px] font-semibold tabular-nums text-[var(--color-text)]"
				>
					{imperfect}
				</span>
			</svelte:element>
			<span data-testid="perfect-total" class="ml-1 text-[12px] text-[var(--color-text-tertiary)]">
				/ <span class="tabular-nums">{stats.total}</span> 구절
			</span>
		</div>

		<!-- Two single-series charts in one row rather than two series in one
		     chart: each column's title names its own series, so identity never
		     rests on a legend the reader has to look away to decode. -->
		<div data-testid="series-row" class="mt-2.5 grid grid-cols-2 gap-3.5">
			{#each SERIES as s (s.key)}
				{@const counts = countsOf(s.key)}
				{@const rated = counts.some((n) => n > 0)}
				{@const left = unrated(s.key)}
				<!-- A flex column so the 미평가 footer can be pinned to the bottom.
				     The grid stretches both columns to the taller one, so the two
				     footers line up whether a column holds a chart or the note —
				     matching their heights by hand needs a magic number that goes
				     stale the moment a font size changes. -->
				<div class="flex h-full flex-col">
					<p
						class="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]"
					>
						{s.label}
					</p>

					{#if rated}
						<div class="mt-1 grid grid-cols-5 gap-1">
							{#each DIFFICULTY_LEVELS as level (level)}
								{@const count = counts[level - 1] ?? 0}
								<!-- The whole column is the target, not the mark: a level with
								     one verse draws a 4px bar, and 4px is not something a
								     finger can hit. An empty level is left inert — a link to
								     an empty list is a dead end. -->
								<svelte:element
									this={count > 0 ? 'a' : 'div'}
									href={count > 0 ? statsVersesHref(eventId, s.key, level) : undefined}
									class="flex flex-col items-center rounded-md {count > 0
										? 'transition-colors hover:bg-[var(--color-elevated)]'
										: ''}"
								>
									<!-- Ink, not the bar's colour: the value is text, and the
									     mark beneath it is what carries the level. -->
									<span
										data-testid="count-{s.key}-{level}"
										class="text-[10px] font-semibold tabular-nums text-[var(--color-text-secondary)]"
									>
										{count}
									</span>
									<!-- w-full is load-bearing: the parent column is items-center,
									     which shrink-wraps, and the bar's width is a percentage of
									     this box. Without it every bar renders at zero width. -->
									<div
										class="flex w-full items-end border-b border-[var(--color-border)]"
										style="height: {PLOT_PX}px"
									>
										<div
											data-testid="bar-{s.key}-{level}"
											role="img"
											aria-label="{s.label} {DIFFICULTY_LABELS[level]} {count}구절"
											style="height: {barPx(count)}px; background-color: {DIFFICULTY_COLORS[
												level
											]}"
											class="w-full rounded-t-[4px]"
										></div>
									</div>
									<span
										data-testid="level-{s.key}-{level}"
										class="pt-0.5 text-[9px] tabular-nums text-[var(--color-text-tertiary)]"
									>
										{level}
									</span>
								</svelte:element>
							{/each}
						</div>
					{:else}
						<!-- Five zeroes over an empty axis is a chart with nothing in it,
						     taking the height of one that has something. -->
						<p
							data-testid="empty-{s.key}"
							class="mt-2 text-[11px] text-[var(--color-text-tertiary)]"
						>
							아직 평가 없음
						</p>
					{/if}

					<svelte:element
						this={left > 0 ? 'a' : 'p'}
						href={left > 0 ? statsVersesHref(eventId, s.key, null) : undefined}
						class="mt-auto pt-1 text-[10px] text-[var(--color-text-tertiary)] {left > 0
							? 'underline-offset-2 hover:underline'
							: ''}"
					>
						미평가
						<span data-testid="unrated-{s.key}" class="font-semibold tabular-nums">
							{left}
						</span>
					</svelte:element>
				</div>
			{/each}
		</div>
	</div>
{/if}
