<script lang="ts">
	import type { PackageMeta } from '$lib/types';
	import { GripVertical, Lock } from 'lucide-svelte';
	import { flip } from 'svelte/animate';
	import { tick } from 'svelte';

	interface Props {
		/** Curated packages in their current order — the reorderable set. */
		packages: PackageMeta[];
		/** OYO (user-kind) row, rendered pinned at the top and not draggable. */
		pinned?: PackageMeta | null;
		/** Called with the new ID order whenever the user finishes a move. */
		onReorder: (ids: string[]) => void;
	}
	let { packages, pinned = null, onReorder }: Props = $props();

	// Local working copy so drag reorders feel instant. Re-seeds whenever the
	// parent hands down a different list (e.g. after a reset to default order).
	let items = $state<PackageMeta[]>([]);
	$effect(() => {
		items = [...packages];
	});

	// Track the dragged row by ID, not index, so live reordering stays stable.
	let draggingId = $state<string | null>(null);
	let listEl: HTMLElement | undefined = $state();

	// Find the slot the pointer is currently over by comparing Y to each row's
	// vertical midpoint. Rows are queried live so positions reflect any reorder.
	function slotAtY(y: number): number {
		if (!listEl) return -1;
		const rows = listEl.querySelectorAll<HTMLElement>('[data-reorder-row]');
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i].getBoundingClientRect();
			if (y < r.top + r.height / 2) return i;
		}
		return rows.length - 1;
	}

	function moveTo(targetIndex: number) {
		const from = items.findIndex((p) => p.id === draggingId);
		if (from < 0 || targetIndex < 0 || targetIndex === from) return;
		const next = [...items];
		const [moved] = next.splice(from, 1);
		next.splice(targetIndex, 0, moved);
		items = next;
	}

	// Listen on window (not the handle): live reordering moves the handle in the
	// DOM, which would drop pointer capture and break a drag after the first swap.
	function onMove(e: PointerEvent) {
		if (!draggingId) return;
		moveTo(slotAtY(e.clientY));
	}

	function endDrag() {
		if (!draggingId) return;
		draggingId = null;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', endDrag);
		window.removeEventListener('pointercancel', endDrag);
		onReorder(items.map((p) => p.id));
	}

	function startDrag(e: PointerEvent, id: string) {
		e.preventDefault();
		draggingId = id;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', endDrag);
		window.addEventListener('pointercancel', endDrag);
	}

	$effect(() => () => endDrag());

	// Keyboard fallback (and a reliable a11y path): arrows on a focused handle
	// nudge that row up/down. Moving the row in the DOM blurs the handle, so we
	// re-focus it after the update to keep repeated presses working.
	async function nudge(id: string, dir: -1 | 1) {
		const i = items.findIndex((p) => p.id === id);
		const j = i + dir;
		if (j < 0 || j >= items.length) return;
		const next = [...items];
		[next[i], next[j]] = [next[j], next[i]];
		items = next;
		onReorder(items.map((p) => p.id));
		await tick();
		listEl?.querySelector<HTMLElement>(`[data-reorder-handle][data-id="${id}"]`)?.focus();
	}

	function onHandleKey(e: KeyboardEvent, id: string) {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			nudge(id, -1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			nudge(id, 1);
		}
	}
</script>

<div bind:this={listEl} class="space-y-3">
	{#if pinned}
		<div
			class="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-elevated)] px-4 py-4 opacity-90"
		>
			<Lock size={16} class="shrink-0 text-[var(--color-text-tertiary)]" />
			<div class="min-w-0 flex-1">
				<h3 class="truncate text-[15px] font-semibold text-[var(--color-text)]">{pinned.name}</h3>
				<p class="text-[11px] text-[var(--color-text-tertiary)]">{pinned.abbreviation}</p>
			</div>
			<span
				class="shrink-0 rounded-full bg-[var(--color-card)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]"
			>
				항상 먼저
			</span>
		</div>
	{/if}

	{#each items as pkg (pkg.id)}
		<div
			data-reorder-row
			animate:flip={{ duration: 200 }}
			class="reorder-row flex items-center gap-2 rounded-2xl border bg-[var(--color-card)] py-3 pl-2 pr-4 {draggingId ===
			pkg.id
				? 'is-dragging border-[var(--color-accent)]'
				: 'border-[var(--color-border)]'}"
		>
			<button
				type="button"
				data-reorder-handle
				data-id={pkg.id}
				onpointerdown={(e) => startDrag(e, pkg.id)}
				onkeydown={(e) => onHandleKey(e, pkg.id)}
				aria-label={`순서 변경: ${pkg.name}. 위/아래 화살표로 이동`}
				class="flex h-10 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)] active:cursor-grabbing"
			>
				<GripVertical size={18} />
			</button>
			<div class="min-w-0 flex-1">
				<h3 class="truncate text-[15px] font-semibold text-[var(--color-text)]">{pkg.name}</h3>
				<p class="text-[11px] text-[var(--color-text-tertiary)]">{pkg.abbreviation}</p>
			</div>
			<span class="shrink-0 text-[18px] font-semibold tabular-nums text-[var(--color-text)]">
				{pkg.verse_number}
			</span>
		</div>
	{/each}
</div>

<style>
	.reorder-row {
		box-shadow: var(--shadow-soft);
		transition: box-shadow 200ms ease;
	}
	.reorder-row.is-dragging {
		box-shadow: var(--shadow-card-hover);
	}
</style>
