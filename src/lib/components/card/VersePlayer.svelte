<script lang="ts">
	import { Pause, Play, Repeat, X } from 'lucide-svelte';
	import ScrubTrack from '$lib/components/player/ScrubTrack.svelte';

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

	function mmss(ms: number): string {
		const s = Math.max(0, Math.floor(ms / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

	<ScrubTrack {fraction} {totalMs} {onSeek} />

	<span class="shrink-0 text-[11px] tabular-nums text-[var(--color-text-secondary)]">
		{mmss(fraction * totalMs)} / {mmss(totalMs)}
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
