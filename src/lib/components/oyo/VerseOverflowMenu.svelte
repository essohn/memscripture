<script lang="ts">
	import { MoreHorizontal, Pencil, Trash2 } from 'lucide-svelte';

	interface Props {
		onEdit?: () => void;
		onDelete?: () => void;
	}
	let { onEdit, onDelete }: Props = $props();

	// Right-anchor the popover so it stays within the card on the right side.
	// MUST stay in sync with the `min-w-[140px]` class on the menu element below.
	const MENU_WIDTH_PX = 140;

	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let menuStyle = $state('');

	function toggle() {
		if (open) {
			open = false;
			return;
		}
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		menuStyle = `top: ${r.bottom + 4}px; left: ${r.right - MENU_WIDTH_PX}px;`;
		open = true;
	}

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	function handleEdit() {
		open = false;
		onEdit?.();
	}

	function handleDelete() {
		open = false;
		onDelete?.();
	}
</script>

<svelte:window onkeydown={onKey} />

<button
	bind:this={triggerEl}
	type="button"
	onclick={toggle}
	aria-haspopup="menu"
	aria-expanded={open}
	aria-label="구절 메뉴"
	class="-mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
>
	<MoreHorizontal size={18} strokeWidth={1.75} />
</button>

{#if open}
	<div
		class="fixed inset-0 z-[55]"
		onclick={() => (open = false)}
		role="presentation"
		aria-hidden="true"
	></div>
	<div
		role="menu"
		aria-label="구절 액션"
		class="fixed z-[60] min-w-[140px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-lg"
		style={menuStyle}
	>
		{#if onEdit}
			<button
				type="button"
				role="menuitem"
				onclick={handleEdit}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				<Pencil size={14} strokeWidth={1.75} />
				편집
			</button>
		{/if}
		{#if onDelete}
			<button
				type="button"
				role="menuitem"
				onclick={handleDelete}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--color-danger)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				<Trash2 size={14} strokeWidth={1.75} />
				삭제
			</button>
		{/if}
	</div>
{/if}
