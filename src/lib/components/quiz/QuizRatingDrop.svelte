<script lang="ts">
	import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, type DifficultyLevel } from '$lib/db/verseRatings';
	import { droppedRating, ratingWouldChange } from '$lib/quiz/rating';

	/**
	 * "This verse just got harder", shown where it happened.
	 *
	 * A rating that changes in the background is a rating the reader has to go
	 * and look up to trust. The round says so on the spot, in the same two
	 * colours the badge uses everywhere else, so the number they later see on
	 * the card is one they watched move.
	 */
	interface Props {
		/** 첫 시작 난이도 or 전체 난이도 — whichever this game tested. */
		label: string;
		/** The rating before the miss. Null is 미평가. */
		from: DifficultyLevel | null;
	}
	let { label, from }: Props = $props();

	const to = $derived(droppedRating(from));
	const moves = $derived(ratingWouldChange(from));
</script>

{#if moves}
	<p
		data-testid="rating-drop"
		class="mt-1.5 flex items-center gap-1.5 text-[10px] tracking-wider text-[var(--color-text-tertiary)] uppercase"
	>
		<span>{label}</span>
		{#if from === null}
			<span class="pill unrated">미평가</span>
		{:else}
			<span class="pill" style="background-color: {DIFFICULTY_COLORS[from]};">{from}</span>
		{/if}
		<span aria-hidden="true">→</span>
		<span
			data-testid="rating-drop-to"
			class="pill landed"
			style="background-color: {DIFFICULTY_COLORS[to]};">{to}</span
		>
		<span class="sr-only">
			{from === null ? '미평가' : DIFFICULTY_LABELS[from]}에서 {DIFFICULTY_LABELS[to]}로 내려갔습니다
		</span>
		<span aria-hidden="true" class="normal-case">{DIFFICULTY_LABELS[to]}</span>
	</p>
{/if}

<style>
	.pill {
		display: inline-flex;
		min-width: 17px;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 0 5px;
		font-size: 10px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: #fff;
	}

	/* 미평가 has no colour of its own — the badge draws it as an outline
	   everywhere else, and this follows that. */
	.unrated {
		border: 1.5px dashed var(--color-border);
		background: none;
		color: var(--color-text-tertiary);
	}

	/* The one that just moved. Stepped, like the rest of the arcade. */
	.landed {
		animation: drop-in 240ms steps(4, end) both;
	}

	@keyframes drop-in {
		from {
			transform: translateY(-6px) scale(1.6);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.landed {
			animation: none;
		}
	}
</style>
