<script lang="ts">
	import { arcade } from '$lib/state/arcade.svelte';

	/**
	 * Correct! or Wrong!, stamped over whatever the round was asking about.
	 *
	 * It used to live on a wall laid over 정답, and the wall's job was to hide
	 * that answer until the round was over. The answer is a ticker now and
	 * nothing is hidden, so the wall went — but the stamp is the verdict, and a
	 * verdict is not something the screen can stop showing. It moves onto the
	 * board instead, where the reader is already looking.
	 */
	interface Props {
		outcome: 'pass' | 'fail';
	}
	let { outcome }: Props = $props();

	/** The chime lands with the stamp: being right is the event. */
	$effect(() => {
		arcade.play(outcome === 'pass' ? 'correct' : 'fail');
	});
</script>

<!-- Decoration: the round announces its verdict in words to assistive tech,
     and reading the stamp aloud after that would be saying it twice. -->
<div class="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
	{#if outcome === 'fail'}
		<span data-testid="wrong-stamp" class="stamp wrong">Wrong!</span>
	{:else}
		<span data-testid="correct-stamp" class="stamp right">Correct!</span>
	{/if}
</div>

<style>
	/* A stamp rather than a road sign: an octagon is the shape the word STOP
	   lives in, and these are verdicts on an answer. Set at an angle because a
	   stamp is never quite square to the page. */
	.stamp {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px 18px;
		border-width: 4px;
		border-style: solid;
		border-radius: 6px;
		font-size: 24px;
		font-weight: 900;
		letter-spacing: 0.04em;
		animation: stamp-land 220ms steps(4, end) both;
	}

	.wrong {
		border-color: var(--color-danger);
		background-color: color-mix(in srgb, var(--color-danger) 14%, var(--color-card));
		color: var(--color-danger);
	}

	/* 연두: the app's ribbon green lifted toward yellow. The ribbon tone is a
	   quiet olive made to sit under text as a bookmark; a verdict has to carry
	   the board, and next to the red of Wrong! a muted green reads as grey. */
	.right {
		--stamp-green: color-mix(in srgb, var(--color-ribbon-green) 62%, #a8d24e);
		border-color: var(--stamp-green);
		background-color: color-mix(in srgb, var(--stamp-green) 16%, var(--color-card));
		color: color-mix(in srgb, var(--stamp-green) 80%, var(--color-text));
	}

	/* Down and landing, which is what a stamp does. */
	@keyframes stamp-land {
		from {
			transform: rotate(-7deg) scale(2.1);
			opacity: 0;
		}
		to {
			transform: rotate(-7deg) scale(1);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stamp {
			animation: none;
			transform: rotate(-7deg);
		}
	}
</style>
