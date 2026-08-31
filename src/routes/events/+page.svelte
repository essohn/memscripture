<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { goto } from '$app/navigation';
	import { dDay, hasEventStats, type EventCardVM } from '$lib/db/events';
	import EventStats from '$lib/components/home/EventStats.svelte';
	import { isUserEventId } from '$lib/db/userEvents';
	import { Pencil, Plus } from 'lucide-svelte';
	import { todayLocalKey } from '$lib/db/activity';
	import type { EventsLoadData } from './+page';

	let { data }: { data: EventsLoadData } = $props();

	const today = todayLocalKey();

	/** "D-3" while it is coming, the date once it is done — a countdown to a
	 *  day that has passed is a number nobody wants. */
	function when(card: EventCardVM): string {
		const d = dDay(card.dueAt, today);
		if (d > 0) return `D-${d}`;
		if (d === 0) return '오늘';
		return card.dueAt;
	}
</script>

<Header title="암송 DAY" onBack={() => goto('/settings')} showVerseToggle={false} />

<main class="mx-auto w-full max-w-2xl px-4 py-4">
	{#snippet list(cards: EventCardVM[])}
		<ul class="mt-2 space-y-2">
			{#each cards as card (card.eventId)}
				<li
					class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
				>
					<div class="flex items-start gap-2">
						<div class="min-w-0 flex-1">
							<p class="text-[15px] font-medium text-[var(--color-text)]">{card.eventTitle}</p>
							<p class="mt-0.5 text-[12px] tabular-nums text-[var(--color-text-secondary)]">
								{when(card)} · 완벽 {card.stats.perfect} / {card.stats.total} 구절
							</p>
						</div>
						<!-- Only the reader's own DAYs get a pencil. The published ones
						     arrive with the app and would be overwritten by the next
						     release, so offering to edit them would be a lie. -->
						{#if isUserEventId(card.eventId)}
							<button
								type="button"
								onclick={() => goto(`/events/edit?id=${encodeURIComponent(card.eventId)}`)}
								aria-label="{card.eventTitle} 고치기"
								class="-mr-1 -mt-1 rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)]"
							>
								<Pencil size={16} strokeWidth={1.75} />
							</button>
						{/if}
					</div>
					<!-- The home screen's own chart, unchanged. Every bar already
					     links to that level's verses, so the archive answers "how
					     did that one go" with the same picture and the same way in
					     — rather than a single link into one arbitrary level. -->
					{#if hasEventStats(card.stats)}
						<EventStats stats={card.stats} eventId={card.eventId} />
					{/if}
				</li>
			{/each}
		</ul>
	{/snippet}

	{#if data.current.length > 0}
		<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">진행 중</h2>
		{@render list(data.current)}
	{/if}

	{#if data.past.length > 0}
		<h2
			class="mt-6 text-[13px] font-semibold text-[var(--color-text-secondary)]"
			class:mt-0={data.current.length === 0}
		>
			지난 암송 DAY
		</h2>
		{@render list(data.past)}
	{/if}

	{#if data.current.length === 0 && data.past.length === 0}
		<p class="mt-6 text-center text-[13px] text-[var(--color-text-secondary)]">
			아직 암송 DAY가 없습니다.
		</p>
	{/if}

	<button
		type="button"
		onclick={() => goto('/events/edit')}
		class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--color-border)] py-3 text-[14px] font-medium text-[var(--color-text-secondary)]"
	>
		<Plus size={17} strokeWidth={1.75} />
		새 암송 DAY
	</button>
</main>
