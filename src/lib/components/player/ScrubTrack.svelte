<script lang="ts">
	/**
	 * The draggable position track, shared by the card player and the playlist
	 * bar. Extracted so the two do not drift apart — the pointer-capture
	 * handling below is the fiddly part, and there should be one of it.
	 */
	interface Props {
		fraction: number;
		totalMs: number;
		onSeek: (fraction: number) => void;
	}
	let { fraction, totalMs, onSeek }: Props = $props();

	let track = $state<HTMLDivElement | undefined>();
	/** Held while dragging, so the thumb follows the finger instead of snapping
	 *  back to whatever the synthesizer last reported. */
	let scrubbing = $state<number | null>(null);
	const shown = $derived(scrubbing ?? fraction);

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
