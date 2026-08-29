<script lang="ts">
	/**
	 * One line of text sliding past, for the two blocks that used to be boxes.
	 *
	 * 정답 and 입력한 내용 were paragraphs, and on a phone the round has to share
	 * the screen with a keyboard: between them they took most of what was left.
	 * A strip is one line high whatever the verse is, so the reader can put the
	 * two side by side and read the difference off them without the card
	 * growing.
	 *
	 * The text is duplicated and the pair slid by exactly half their width,
	 * which is what makes the loop seamless — the second copy arrives where the
	 * first left. It is decoration of the first copy, so it is hidden from
	 * assistive tech; the real one is read once, in place, as ordinary text.
	 */
	interface Props {
		/** Identifies the rail to tests and to anything reading the DOM. */
		testid: string;
		label: string;
		/** The whole line. Empty renders the rail and nothing in it, so the
		 *  round's height does not change when the answer lands. */
		text: string;
		/** Per-word marks, when the caller has diffed the line. */
		marks?: { word: string; ok: boolean }[];
	}
	let { testid, label, text, marks }: Props = $props();

	/**
	 * Seconds for one lap, so long verses do not crawl and short ones do not
	 * flick past. Roughly a quarter second a character, floored at something a
	 * reader can catch.
	 */
	const seconds = $derived(Math.max(9, Math.round(text.trim().length * 0.28)));
	const empty = $derived(text.trim().length === 0);
</script>

<div data-testid={testid} class="mt-1.5 flex items-center gap-2">
	<span
		class="shrink-0 text-[9px] font-medium tracking-[0.14em] text-[var(--color-text-tertiary)] uppercase"
	>
		{label}
	</span>
	<!-- Scrollable rather than clipped when the motion is off: the reader still
	     has to be able to get to the end of the line. -->
	<div data-testid="ticker-rail" class="rail relative min-w-0 flex-1 overflow-hidden">
		{#if !empty}
			<div class="track" style="--lap: {seconds}s">
				{#each [0, 1] as copy (copy)}
					<span
						class="chunk"
						data-testid={copy === 0 ? `${testid}-line` : undefined}
						aria-hidden={copy === 1 ? 'true' : undefined}
					>
						{#if marks}
							{#each marks as m, i (i)}<span class={m.ok ? '' : 'wrong'}>{m.word}</span>{' '}{/each}
						{:else}
							{text}
						{/if}
					</span>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.track {
		display: flex;
		width: max-content;
		animation: ticker var(--lap) linear infinite;
	}

	/* One line high whether or not there is a line in it. Without this the rail
	   collapsed to its label while the round ran and grew when the answer
	   landed — which is the button moving under the reader's thumb, the whole
	   thing these rails were meant to stop. */
	.rail {
		min-height: calc(12px * var(--vfs, 1) * 1.6);
	}

	/* The gap lives inside each copy, so half the track is exactly one copy and
	   the loop has no seam. A flex gap would sit outside that arithmetic. */
	.chunk {
		padding-right: 3rem;
		white-space: nowrap;
		font-size: calc(12px * var(--vfs, 1));
		line-height: 1.6;
		color: var(--color-text);
	}

	.wrong {
		border-radius: 3px;
		background-color: color-mix(in srgb, var(--color-ribbon-red) 20%, transparent);
		padding: 0 2px;
		color: var(--color-danger);
	}

	@keyframes ticker {
		to {
			transform: translateX(-50%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.track {
			animation: none;
		}
		/* Nothing slides it into view any more, so the line has to be reachable
		   by hand. */
		.rail {
			overflow-x: auto;
		}
		/* Nothing is moving, so the second copy is only noise, and the line has
		   to be reachable by hand instead. */
		.chunk:nth-child(2) {
			display: none;
		}
	}
</style>
