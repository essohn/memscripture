<script lang="ts">
	interface Props {
		current: number; // 1-indexed
		total: number;
	}
	let { current, total }: Props = $props();
</script>

<div
	class="text-[12px] font-medium uppercase tracking-[0.16em] tabular-nums text-[var(--color-text-tertiary)]"
	aria-label={`${current} of ${total}`}
>
	{Math.min(current, total)} / {total}
</div>
