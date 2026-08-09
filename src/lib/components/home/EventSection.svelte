<script lang="ts">
	import { CalendarCheck, Download } from 'lucide-svelte';
	import type { EventCardVM } from '$lib/db/events';
	import EventExportSheet from './EventExportSheet.svelte';
	import { collectEventVerses, exportFileName } from '$lib/export/eventExport';
	import { buildEventSheet, type ExportOptions } from '$lib/export/eventWorkbook';
	import { writeXlsx } from '$lib/export/xlsx';
	import { todayLocalKey } from '$lib/db/activity';

	interface Props {
		events: EventCardVM[];
		onEmpty?: () => void;
	}
	let { events, onEmpty }: Props = $props();

	let exporting = $state<EventCardVM | null>(null);
	let busy = $state(false);

	function dDayLabel(d: number): string {
		return d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`;
	}

	async function runExport(ev: EventCardVM, options: ExportOptions) {
		busy = true;
		try {
			const verses = await collectEventVerses(ev.ranges);
			// An empty workbook would look like a successful export of nothing.
			if (verses.length === 0) {
				onEmpty?.();
				return;
			}
			const bytes = writeXlsx(buildEventSheet(ev.eventTitle, verses, options));
			const url = URL.createObjectURL(
				// bytes.buffer, not bytes: zipStore's final .slice() always yields a
				// plain, exact-length ArrayBuffer, but TS's default Uint8Array<ArrayBufferLike>
				// widens too far for BlobPart, which wants Uint8Array<ArrayBuffer>.
				new Blob([bytes.buffer as ArrayBuffer], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				})
			);
			const a = document.createElement('a');
			a.href = url;
			a.download = exportFileName(ev.eventTitle, todayLocalKey());
			a.click();
			URL.revokeObjectURL(url);
			exporting = null;
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
						onclick={() => (exporting = ev)}
						aria-label="{ev.eventTitle} 엑셀로 다운로드"
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
			</div>
			{#if exporting?.eventId === ev.eventId}
				<EventExportSheet
					eventTitle={ev.eventTitle}
					{busy}
					onConfirm={(options) => runExport(ev, options)}
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
