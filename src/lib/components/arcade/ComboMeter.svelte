<script lang="ts">
	import { untrack } from 'svelte';
	import ComboBadge from './ComboBadge.svelte';

	interface Props {
		/** Date.now() when the round appeared. */
		startedAt: number;
		limitMs: number;
		streak: number;
		/** Stops the bar where it stands, once the round has been answered. */
		frozen?: boolean;
		/** True when the answer landed after the clock ran out. */
		late?: boolean;
	}
	let { startedAt, limitMs, streak, frozen = false, late = false }: Props = $props();

	/**
	 * How far into the drain this bar starts, captured once.
	 *
	 * Read at render time it would be recomputed the moment `frozen` flips,
	 * and the bar would jump on the very frame the reader answered — the one
	 * frame they are looking at it. The component is keyed per round, so once
	 * is exactly right.
	 */
	const delayMs = untrack(() => Math.min(0, startedAt - Date.now()));
</script>

<div class="mt-3 flex items-center gap-2">
	<!-- The bar is information, not decoration, so it runs under reduced
	     motion too: a linear drain is what a countdown looks like, and hiding
	     it would leave the round with a rule nobody can see. Driven by a CSS
	     animation rather than a frame loop — the browser can do this one
	     without waking the main thread sixty times a second. -->
	<div
		class="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-elevated)]"
		role="progressbar"
		aria-label="남은 시간"
	>
		<div
			data-testid="combo-bar"
			data-frozen={frozen}
			class="h-full origin-left rounded-full {late
				? 'bg-[var(--color-danger)]'
				: 'bg-[var(--color-accent)]'}"
			style="animation: combo-drain {limitMs}ms linear forwards; animation-delay: {delayMs}ms; {frozen
				? 'animation-play-state: paused;'
				: ''}"
		></div>
	</div>

	<ComboBadge {streak} />
</div>

<style>
	@keyframes combo-drain {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}
</style>
