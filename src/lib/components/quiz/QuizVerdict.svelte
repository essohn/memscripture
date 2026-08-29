<script lang="ts">
	/**
	 * How the round went, said once and said plainly.
	 *
	 * It used to be a line of 13px text at the foot of the card — the same size
	 * as the labels above it and smaller than the verse — and it is the one
	 * thing the reader is looking for when they answer. Each game also had its
	 * own word for a pass (통과, 격추, 맞았습니다), which made the three read as
	 * three different results rather than the one they are.
	 *
	 * The failing side keeps its own wording rather than becoming 오답. It is
	 * not only a verdict: it says where the verse is going, and the summary
	 * that follows lists those verses under the same heading. The Wrong! stamp
	 * on the wall above has already said the short version.
	 */
	interface Props {
		passed: boolean;
	}
	let { passed }: Props = $props();
</script>

<!-- Square corners, and taller than a control. Rounded to the same radius as
     the 다음 button under it, this read as a second button — the eye sorts a
     card from a control by its corners long before it reads either. The right
     angles are also the more arcade of the two, which is where this screen
     lives now.

     Announced politely: it appears at the same moment as the answer and the
     stamp, and an assertive region would cut across the reader taking those
     in. -->
<p
	data-testid="quiz-verdict"
	role="status"
	class="mt-3 border-2 py-4 text-center text-[calc(19px*var(--vfs))] font-bold {passed
		? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
		: 'border-[var(--color-danger)] text-[var(--color-danger)]'}"
>
	{passed ? '정답!' : '다시 볼 구절'}
</p>
