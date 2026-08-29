<script lang="ts">
	/**
	 * The verse as it actually reads, shown once a round is answered.
	 *
	 * Every round ends with one of these, right or wrong. Each game shows the
	 * reader something different in the moment — 퍼펙트 게임 marks the words
	 * they missed, 시작 3단어 게임 shows three words, 자주 틀리는 곳 찾기 shows
	 * a sentence that is wrong on purpose — and none of those is the verse. A
	 * marked-up diff tells you where you slipped but not what to learn, and
	 * after a 시작 3단어 round the rest of the verse never appeared at all.
	 *
	 * Shared rather than repeated in three files so the three games cannot
	 * drift into three different answers to the same question.
	 */
	interface Props {
		/** The verse body, exactly as stored. */
		w: string;
	}
	let { w }: Props = $props();
</script>

<p
	class="mt-3 text-[10.5px] font-medium tracking-[0.16em] text-[var(--color-text-tertiary)] uppercase"
>
	정답
</p>
<p
	data-testid="quiz-answer"
	class="mt-1 rounded-xl bg-[var(--color-elevated)] px-2.5 py-2 text-[calc(12px*var(--vfs))] leading-[1.55] break-keep text-[var(--color-text)]"
>
	{w}
</p>
