<script lang="ts">
	import { CalendarCheck, Download, Play, Square } from 'lucide-svelte';
	import type { EventCardVM } from '$lib/db/events';
	import EventExportSheet, { type SheetNotice } from './EventExportSheet.svelte';
	import { exportEventXlsx } from '$lib/export/eventExport';
	import { exportEventToSheets } from '$lib/export/eventSheetExport';
	import type { ExportOptions } from '$lib/export/eventWorkbook';
	import { todayLocalKey } from '$lib/db/activity';
	import PlaylistBar from '$lib/components/player/PlaylistBar.svelte';
	import { PlaylistPlayer } from '$lib/state/playlistPlayer.svelte';

	// One session for the whole section. Several events can be on screen; only
	// one of them can be speaking, because there is one synthesizer.
	const player = new PlaylistPlayer();
	$effect(() => {
		void player.load();
		return () => player.destroy();
	});

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
					<div class="ml-auto flex items-center gap-1">
						{#if player.supported && ev.verses.length > 0}
							{@const open = player.openId === `event:${ev.eventId}`}
							<!--
								Stop, not pause, and not a muted speaker: the transport
								lives in the bar, so this button's whole promise is "start
								this list / put it away". Same reasoning as VerseCard's
								speaker chip.
							-->
							<button
								type="button"
								onclick={() =>
									open ? player.close() : player.start(`event:${ev.eventId}`, ev.verses)}
								aria-label="{ev.eventTitle} {open ? '듣기 정지' : '전체 듣기'}"
								class="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors {open
									? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
									: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
							>
								{#if open}
									<Square size={14} strokeWidth={2} fill="currentColor" />
								{:else}
									<Play size={15} strokeWidth={1.75} />
								{/if}
							</button>
						{/if}
						<button
							type="button"
							onclick={() => openSheet(ev)}
							aria-label="{ev.eventTitle} 내보내기"
							class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
						>
							<Download size={15} strokeWidth={1.75} />
						</button>
					</div>
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
		{#if player.openId}
			<PlaylistBar
				playing={player.playing}
				label={player.nowPlaying?.cite ?? ''}
				index={player.index}
				count={player.count}
				fraction={player.progress.fraction}
				elapsedMs={player.progress.elapsedMs}
				totalMs={player.progress.totalMs}
				repeat={player.listRepeat}
				onToggle={() => player.toggle()}
				onSeek={(f) => player.seek(f)}
				onToggleRepeat={() => player.toggleRepeat()}
				onClose={() => player.close()}
			/>
		{/if}
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
