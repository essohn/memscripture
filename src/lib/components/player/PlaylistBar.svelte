<script lang="ts">
	import { Pause, Play, Repeat, X } from 'lucide-svelte';
	import ScrubTrack from './ScrubTrack.svelte';

	/**
	 * The transport for a whole list, docked above the tab bar.
	 *
	 * Fixed rather than inline: a twelve-verse list is longer than a screen,
	 * and a reader who scrolls to follow along must not have to scroll back to
	 * find the stop button. Presentational like VersePlayer — every piece of
	 * state arrives as a prop, so the page owns the playback and this owns
	 * only how it looks.
	 */
	interface Props {
		playing: boolean;
		/** The verse being read, e.g. "창세기 28:14". */
		label: string;
		/** 1-based place in the list. */
		index: number;
		count: number;
		fraction: number;
		elapsedMs: number;
		totalMs: number;
		repeat: boolean;
		/** No voice on this device would speak. The bar stops where the sound
		 *  stopped and says why, rather than filling itself in. */
		failed?: boolean;
		onToggle: () => void;
		onSeek: (fraction: number) => void;
		onToggleRepeat: () => void;
		onClose: () => void;
	}
	let {
		playing,
		label,
		index,
		count,
		fraction,
		elapsedMs,
		totalMs,
		repeat,
		failed = false,
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

<!--
	z-40, under the tab bar's z-50: a player is something you reach for, but
	never at the cost of covering the way out of the screen.
-->
<div
	class="playlist-bar fixed inset-x-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-card)]"
>
	<div class="mx-auto flex max-w-2xl flex-col gap-1.5 px-5 py-2.5">
		<!-- Above the controls, not below: it explains why the bar stopped, and
		     a reader whose sound never came is looking at the top of it. role
		     status so it is announced — nothing else moves when playback fails
		     silently, which is the entire problem it exists to name. -->
		{#if failed}
			<p role="status" class="text-[12px] text-[var(--color-danger)]">
				소리를 낼 수 없습니다. 설정에서 다른 음성을 골라보세요.
			</p>
		{/if}
		<div class="flex items-center gap-2.5">
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

			<p class="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text)]">
				{label}
			</p>
			<!-- Never truncates: which verse of how many is the one thing this
			     bar exists to say that the card player could not. -->
			<span class="shrink-0 text-[12px] tabular-nums text-[var(--color-text-tertiary)]">
				{index}/{count}
			</span>

			<button
				type="button"
				onclick={onToggleRepeat}
				aria-pressed={repeat}
				aria-label="목록 반복"
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors {repeat
					? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
					: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)]'}"
			>
				<Repeat size={13} strokeWidth={2} />
			</button>
			<button
				type="button"
				onclick={onClose}
				aria-label="재생 닫기"
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
			>
				<X size={14} strokeWidth={2} />
			</button>
		</div>

		<div class="flex items-center gap-2.5">
			<ScrubTrack {fraction} {totalMs} {onSeek} />
			<span class="shrink-0 text-[11px] tabular-nums text-[var(--color-text-secondary)]">
				{mmss(elapsedMs)} / {mmss(totalMs)}
			</span>
		</div>
	</div>
</div>

<style>
	/* Sits on top of the tab bar's own height (h-16) plus whatever the device
	   reserves below it. */
	.playlist-bar {
		bottom: calc(4rem + env(safe-area-inset-bottom));
		box-shadow: var(--shadow-card-hover);
	}
</style>
