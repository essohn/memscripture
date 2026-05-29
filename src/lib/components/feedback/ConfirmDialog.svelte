<script lang="ts">
	interface Props {
		open: boolean;
		title: string;
		body: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	}
	let {
		open,
		title,
		body,
		confirmLabel = '확인',
		cancelLabel = '취소',
		onConfirm,
		onCancel
	}: Props = $props();

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div
		class="fixed inset-0 z-[55] bg-black/30"
		onclick={onCancel}
		role="presentation"
		aria-hidden="true"
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-title"
		class="fixed inset-x-5 top-1/2 z-[60] mx-auto max-w-md -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-2xl"
	>
		<h2 id="confirm-title" class="text-[15px] font-semibold text-[var(--color-text)]">
			{title}
		</h2>
		<p class="mt-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
			{body}
		</p>
		<div class="mt-5 flex items-center justify-end gap-2">
			<button
				type="button"
				onclick={onCancel}
				autofocus
				class="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				{cancelLabel}
			</button>
			<button
				type="button"
				onclick={onConfirm}
				class="rounded-full bg-[var(--color-danger)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				{confirmLabel}
			</button>
		</div>
	</div>
{/if}
