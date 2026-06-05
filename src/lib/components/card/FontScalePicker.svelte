<script lang="ts">
	import { VERSE_FONT_SCALES, type VerseFontScale } from '$lib/db/viewOptions';

	interface Props {
		value: VerseFontScale;
		onpick: (scale: VerseFontScale) => void;
	}
	let { value, onpick }: Props = $props();

	const LABELS: Record<number, string> = {
		0.8: '아주 작게',
		0.9: '작게',
		1.0: '보통',
		1.15: '크게',
		1.3: '매우 크게'
	};

	let expanded = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let popoverStyle = $state('');

	function open() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		// Right-anchor so the popover stays inside the viewport when the trigger
		// is in the right-aligned toolbar.
		popoverStyle = `top: ${r.bottom + 6}px; right: ${Math.max(8, window.innerWidth - r.right)}px;`;
		expanded = true;
	}

	function toggle() {
		if (expanded) {
			expanded = false;
		} else {
			open();
		}
	}

	function pick(scale: VerseFontScale) {
		onpick(scale);
		expanded = false;
	}

	function onKey(e: KeyboardEvent) {
		if (expanded && e.key === 'Escape') expanded = false;
	}
</script>

<svelte:window onkeydown={onKey} />

<button
	bind:this={triggerEl}
	type="button"
	onclick={toggle}
	aria-haspopup="menu"
	aria-expanded={expanded}
	aria-label="글자 크기 (현재 {LABELS[value]})"
	class="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
>
	<!-- "Aa" — a smaller A next to a larger A — is the universal font-size affordance. -->
	<span class="font-semibold leading-none">
		<span class="text-[10px]">A</span><span class="text-[14px]">a</span>
	</span>
</button>

{#if expanded}
	<div
		class="fixed inset-0 z-[55]"
		onclick={() => (expanded = false)}
		role="presentation"
		aria-hidden="true"
	></div>
	<div
		role="menu"
		aria-label="글자 크기 선택"
		class="fixed z-[60] min-w-[140px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-lg"
		style={popoverStyle}
	>
		{#each VERSE_FONT_SCALES as scale (scale)}
			{@const active = Math.abs(value - scale) < 0.001}
			<button
				type="button"
				role="menuitem"
				aria-pressed={active}
				onclick={() => pick(scale)}
				class="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)] {active
					? 'bg-[var(--color-elevated)] font-semibold'
					: ''}"
			>
				<span style="font-size: calc(14px * {scale});" class="leading-none">Aa</span>
				<span>{LABELS[scale]}</span>
			</button>
		{/each}
	</div>
{/if}
