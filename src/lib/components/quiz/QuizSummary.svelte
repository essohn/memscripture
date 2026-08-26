<script lang="ts">
	import type { QuizItem } from '$lib/quiz/session';

	interface Props {
		passed: number;
		total: number;
		failed: QuizItem[];
		onAgain: () => void;
		onClose: () => void;
	}
	let { passed, total, failed, onAgain, onClose }: Props = $props();
</script>

<section class="space-y-4 text-center">
	<p class="text-[32px] font-semibold text-[var(--color-text)]">{passed} / {total}</p>

	{#if failed.length > 0}
		<div class="text-left">
			<h2 class="text-[13px] font-semibold text-[var(--color-text-secondary)]">다시 볼 구절</h2>
			<ul class="mt-2 space-y-1">
				{#each failed as f (f.id)}
					<li class="text-[13px] text-[var(--color-text)]">
						{f.title}
						<span class="text-[var(--color-text-tertiary)]">{f.cite}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex gap-2">
		<button
			type="button"
			onclick={onAgain}
			class="flex-1 rounded-xl bg-[var(--color-accent)] py-2.5 font-medium text-white"
		>
			다시 하기
		</button>
		<button
			type="button"
			onclick={onClose}
			class="flex-1 rounded-xl bg-[var(--color-elevated)] py-2.5 font-medium text-[var(--color-text)]"
		>
			끝내기
		</button>
	</div>
</section>
