<script lang="ts">
	import { CalendarCheck, ChevronDown, Download } from 'lucide-svelte';
	import { hasEventStats, type EventCardVM } from '$lib/db/events';
	import { getEventStatsOpen, setEventStatsOpen } from '$lib/db/viewOptions';
	import EventExportSheet, { type SheetNotice } from './EventExportSheet.svelte';
	import EventStats from './EventStats.svelte';
	import { exportEventXlsx } from '$lib/export/eventExport';
	import { exportEventToSheets } from '$lib/export/eventSheetExport';
	import type { ExportOptions } from '$lib/export/eventWorkbook';
	import { todayLocalKey } from '$lib/db/activity';

	interface Props {
		events: EventCardVM[];
		/** Supplied by the route rather than read here: $env/dynamic/public
		 *  resolves only inside a SvelteKit build, and importing it into a
		 *  component puts it out of reach of the component tests. The same
		 *  reason cloud/google.ts and syncFlow.ts take it as an argument. */
		clientId?: string | null;
		onEmpty?: () => void;
		onError?: () => void;
	}
	let { events, clientId = null, onEmpty, onError }: Props = $props();

	/** Which events have their stats expanded, by event id. */
	let statsOpen = $state<Record<string, boolean>>({});

	// Restored from storage rather than defaulted in place: a reader who leaves
	// it open should find it open tomorrow. Reads `events` only, so writing the
	// map below cannot re-trigger this.
	$effect(() => {
		const ids = events.map((e) => e.eventId);
		void (async () => {
			const flags = await Promise.all(ids.map((id) => getEventStatsOpen(id).catch(() => false)));
			const next: Record<string, boolean> = {};
			ids.forEach((id, i) => (next[id] = flags[i]));
			statsOpen = next;
		})();
	});

	/** Flipped locally first: the chart should appear on the tap, not once
	 *  IndexedDB has acknowledged a preference. */
	function toggleStats(eventId: string) {
		const open = !statsOpen[eventId];
		statsOpen = { ...statsOpen, [eventId]: open };
		setEventStatsOpen(eventId, open).catch(() => {});
	}

	let exporting = $state<EventCardVM | null>(null);
	let busy = $state(false);
	let sheetBusy = $state(false);
	let sheetNotice = $state<SheetNotice | null>(null);

	function openSheet(ev: EventCardVM) {
		exporting = ev;
		// A notice belongs to the export that produced it; carrying last week's
		// link into a different event would offer the wrong document.
		sheetNotice = null;
	}

	function dDayLabel(d: number): string {
		return d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`;
	}

	/**
	 * Sends the event to the reader's Google Sheet and opens it.
	 *
	 * Not `async`: the blank tab has to be opened inside the tap itself. A tab
	 * asked for after the upload resolves is a pop-up as far as Safari and
	 * Chrome are concerned, and gets blocked — the same user-gesture rule that
	 * silenced iOS speech when an await slipped in ahead of speak(). When the
	 * browser refuses even the synchronous open, the notice carries the link
	 * instead so the export is never lost.
	 */
	function runSheetExport(ev: EventCardVM, options: ExportOptions) {
		const tab = window.open('', '_blank');
		sheetBusy = true;
		sheetNotice = null;
		exportEventToSheets(
			ev.eventId,
			{ title: ev.eventTitle, dueAt: ev.dueAt },
			ev.ranges,
			options,
			clientId
		)
			.then((result) => {
				if (result.kind === 'ok') {
					if (tab) tab.location.replace(result.url);
					sheetNotice = {
						text: result.created
							? 'Google Sheets 문서를 만들었습니다'
							: 'Google Sheets 문서를 업데이트했습니다',
						href: result.url,
						tone: 'ok'
					};
					return;
				}
				tab?.close();
				sheetNotice = failureNotice(result.kind);
			})
			.finally(() => {
				sheetBusy = false;
			});
	}

	function failureNotice(kind: 'empty' | 'not-connected' | 'expired' | 'error'): SheetNotice {
		if (kind === 'empty') return { text: '내보낼 구절이 없습니다', tone: 'error' };
		if (kind === 'not-connected') {
			return { text: 'Google Drive를 먼저 연결해주세요', settings: true, tone: 'error' };
		}
		if (kind === 'expired') {
			return { text: '로그인이 만료되었습니다 — 다시 연결해주세요', settings: true, tone: 'error' };
		}
		return { text: 'Google Sheets로 보내지 못했습니다', tone: 'error' };
	}

	async function runExport(ev: EventCardVM, options: ExportOptions) {
		busy = true;
		try {
			// exportEventXlsx never rejects — it routes both the empty and the
			// error path through callbacks — so only success closes the sheet.
			const produced = await exportEventXlsx(
				{ title: ev.eventTitle, dueAt: ev.dueAt },
				ev.ranges,
				options,
				todayLocalKey(),
				{
				onEmpty,
				onError
			});
			if (produced) exporting = null;
		} finally {
			busy = false;
		}
	}
</script>

{#if events.length > 0}
	<section class="mb-8">
		{#each events as ev (ev.eventId)}
			<div class="mb-5">
				<div class="flex items-center justify-between gap-3 px-1">
					<div
						class="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]"
					>
						<CalendarCheck size={13} class="text-[var(--color-accent)]" />
						{ev.eventTitle}
					</div>
					<button
						type="button"
						onclick={() => openSheet(ev)}
						aria-label="{ev.eventTitle} 내보내기"
						class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
					>
						<Download size={15} strokeWidth={1.75} />
					</button>
					<span
						class="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--color-accent)]"
					>
						{dDayLabel(ev.dDay)}
					</span>
				</div>
				<div class="mt-3 grid grid-cols-2 gap-3 px-1">
					{#each ev.ranges as r, i (i)}
						<a
							href={r.href}
							class="event-card block rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 transition-all hover:border-[var(--color-accent)]/50"
						>
							<h3 class="truncate text-[15px] font-semibold text-[var(--color-text)]">{r.label}</h3>
							<p class="mt-1 text-[12px] tabular-nums text-[var(--color-text-secondary)]">
								{r.done}/{r.total} 암송
							</p>
						</a>
					{/each}
				</div>
				<!-- Folded by default. The chart is 177px of home page answering a
				     question most opens do not ask, and the range cards above are
				     what the reader came for. Withheld entirely when there is
				     nothing plotted yet — a toggle onto an empty panel is worse
				     than no toggle. -->
				{#if hasEventStats(ev.stats)}
					<div class="mt-2 px-1">
						<button
							type="button"
							onclick={() => toggleStats(ev.eventId)}
							aria-expanded={statsOpen[ev.eventId] ? 'true' : 'false'}
							aria-controls="event-stats-{ev.eventId}"
							class="mx-auto flex min-h-[44px] items-center gap-1 rounded-full px-3 text-[11px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-secondary)]"
						>
							{statsOpen[ev.eventId] ? '통계 숨기기' : '통계 보기'}
							<ChevronDown
								size={13}
								class="transition-transform {statsOpen[ev.eventId] ? 'rotate-180' : ''}"
							/>
						</button>
						<!-- Rendered whether or not it is open so aria-controls always
						     points at something that exists. -->
						<div id="event-stats-{ev.eventId}">
							{#if statsOpen[ev.eventId]}
								<EventStats stats={ev.stats} eventId={ev.eventId} />
							{/if}
						</div>
					</div>
				{/if}
			</div>
			{#if exporting?.eventId === ev.eventId}
				<EventExportSheet
					eventTitle={ev.eventTitle}
					{busy}
					{sheetBusy}
					{sheetNotice}
					onConfirm={(options) => runExport(ev, options)}
					onSheets={(options) => runSheetExport(ev, options)}
					onCancel={() => (exporting = null)}
				/>
			{/if}
		{/each}
	</section>
{/if}

<style>
	.event-card {
		box-shadow: var(--shadow-soft);
		transition:
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1),
			border-color 240ms ease;
	}
	.event-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-card-hover);
	}
</style>
