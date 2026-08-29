<script lang="ts">
	/**
	 * What the reader wrote, once a round is answered.
	 *
	 * Shown beside 정답 and labelled, because unlabelled it was worse than
	 * absent: 퍼펙트 게임 put the marked-up attempt directly above a block
	 * headed 정답, and two paragraphs of verse with only one of them named
	 * leaves the reader working out which is theirs. The check panel answered
	 * the same question the same way — a heading, and the reader's own words in
	 * italic on the bare panel rather than in a box of their own.
	 */
	interface Props {
		/** Exactly what they typed. Empty is a reader who wrote nothing, and
		 *  nothing is what this then shows. */
		typed: string;
		/** Per-word marks, when the game compared the attempt to the verse. */
		marks?: { word: string; ok: boolean }[];
	}
	let { typed, marks }: Props = $props();
</script>

{#if typed.trim().length > 0}
	<p
		class="mt-3 text-[10.5px] font-medium tracking-[0.16em] text-[var(--color-text-tertiary)] uppercase"
	>
		입력한 내용
	</p>
	<p
		data-testid="quiz-attempt"
		class="mt-1 text-[calc(12px*var(--vfs))] leading-[1.55] break-keep italic"
	>
		{#if marks}
			{#each marks as m, i (i)}<span class={m.ok ? '' : 'wrong'}>{m.word}</span>{' '}{/each}
		{:else}
			{typed}
		{/if}
	</p>
{/if}

<style>
	/* The words that did not match. Red rather than the accent: this is the
	   result of a test, not a note the reader left themselves. */
	.wrong {
		border-radius: 3px;
		background-color: color-mix(in srgb, var(--color-ribbon-red) 20%, transparent);
		padding: 0 2px;
		color: var(--color-danger);
	}
</style>
