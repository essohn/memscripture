<script lang="ts">
	import { fly } from 'svelte/transition';

	interface Props {
		message: string;
		actionLabel?: string;
		onAction?: () => void;
		/** ms before the toast auto-dismisses. Default 5000. */
		durationMs?: number;
		onClose: () => void;
	}
	let { message, actionLabel, onAction, durationMs = 5000, onClose }: Props = $props();

	$effect(() => {
		const timer = setTimeout(onClose, durationMs);
		return () => clearTimeout(timer);
	});

	function handleAction() {
		onAction?.();
		onClose();
	}
</script>

<!--
  Sits above the TabBar (z-50, 64px tall). aria-live="polite" so screen readers
  announce the message without interrupting; role="status" carries that intent.
-->
<div
	role="status"
	aria-live="polite"
	class="toast pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
	style="bottom: calc(64px + env(safe-area-inset-bottom) + 12px);"
	transition:fly={{ y: 24, duration: 200 }}
>
	<div
		class="pointer-events-auto flex max-w-[480px] items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-text)] px-4 py-2.5 text-[14px] text-[var(--color-card)] shadow-lg"
	>
		<span class="flex-1">{message}</span>
		{#if actionLabel && onAction}
			<button
				type="button"
				onclick={handleAction}
				class="-mr-1 rounded-full px-3 py-1 text-[13px] font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-80"
			>
				{actionLabel}
			</button>
		{/if}
	</div>
</div>
