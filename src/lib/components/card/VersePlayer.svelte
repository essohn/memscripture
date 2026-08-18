<script lang="ts">
	import { Pause, Play, Repeat, X } from 'lucide-svelte';

	interface Props {
		playing: boolean;
		fraction: number;
		elapsedMs: number;
		totalMs: number;
		repeat: boolean;
		onToggle: () => void;
		onSeek: (fraction: number) => void;
		onToggleRepeat: () => void;
		onClose: () => void;
	}
	let {
		playing,
		fraction,
		elapsedMs,
		totalMs,
		repeat,
		onToggle,
		onSeek,
		onToggleRepeat,
		onClose
	}: Props = $props();

	let track = $state<HTMLDivElement | undefined>();
	/** Held while dragging, so the thumb follows the finger instead of snapping
	 *  back to whatever the synthesizer last reported. */
	let scrubbing = $state<number | null>(null);
	const shown = $derived(scrubbing ?? fraction);

	function mmss(ms: number): string {
		const s = Math.max(0, Math.floor(ms / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	function fractionAt(clientX: number): number {
		if (!track) return 0;
		const r = track.getBoundingClientRect();
		return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
	}

	function onPointerDown(e: PointerEvent) {
		scrubbing = fractionAt(e.clientX);
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (scrubbing === null) return;
		scrubbing = fractionAt(e.clientX);
	}
	function onPointerUp(e: PointerEvent) {
		if (scrubbing === null) return;
		const to = scrubbing;
		scrubbing = null;
		const t = e.currentTarget as Element;
		if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
		onSeek(to);
	}

	// Arrow keys move by ten seconds' worth, which is the granularity that is
	// useful in a verse rather than the one that is easy to implement.
	function onKeydown(e: KeyboardEvent) {
		const step = totalMs > 0 ? 10_000 / totalMs : 0.1;
		if (e.key === 'ArrowRight') onSeek(Math.min(1, fraction + step));
		else if (e.key === 'ArrowLeft') onSeek(Math.max(0, fraction - step));
		else return;
		e.preventDefault();
	}
</script>

<div
	class="mt-3 flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2"
>
	<button
		type="button"
		onclick={onToggle}
		aria-label={playing ? '일시정지' : '재생'}
		class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition-opacity hover:opacity-90"
	>
		{#if playing}
			<Pause size={14} strokeWidth={2.5} fill="currentColor" />
		{:else}
			<Play size={14} strokeWidth={2.5} fill="currentColor" />
		{/if}
	</button>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={track}
		role="slider"
		tabindex="0"
		aria-label="재생 위치"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(shown * 100)}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onkeydown={onKeydown}
		class="group relative h-6 min-w-0 flex-1 cursor-pointer touch-none"
	>
		<div
			class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--color-border)]"
		></div>
		<div
			class="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--color-accent)]"
			style="width: {shown * 100}%"
		></div>
		<div
			class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-accent)] shadow"
			style="left: {shown * 100}%"
		></div>
	</div>

	<span class="shrink-0 text-[11px] tabular-nums text-[var(--color-text-secondary)]">
		{mmss(shown * totalMs)} / {mmss(totalMs)}
	</span>

	<button
		type="button"
		onclick={onToggleRepeat}
		aria-pressed={repeat}
		aria-label="무한 반복"
		class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors {repeat
			? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
			: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-card)]'}"
	>
		<Repeat size={13} strokeWidth={2} />
	</button>
	<button
		type="button"
		onclick={onClose}
		aria-label="재생 닫기"
		class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
	>
		<X size={14} strokeWidth={2} />
	</button>
</div>
