<script lang="ts">
	import { RECITE_SCALES, type ReciteScale } from '$lib/db/viewOptions';
	import { menuFocus } from '$lib/utils/menuFocus';

	interface Props {
		value: ReciteScale;
		onpick: (scale: ReciteScale) => void;
	}
	let { value, onpick }: Props = $props();

	/** Always a decimal, so the six steps and the button's own face are the
	 *  same width and the bar does not shuffle when the choice changes. */
	const label = (scale: number) => scale.toFixed(1);

	let expanded = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let popoverStyle = $state('');

	function open() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		// Above the trigger, not below: this bar sits at the foot of the screen,
		// and a menu opening downward would go off it. Right-anchored for the
		// same reason FontScalePicker is — the trigger lives in a right-aligned
		// row, and a left-anchored menu would run past the edge.
		popoverStyle = `bottom: ${window.innerHeight - r.top + 6}px; right: ${Math.max(8, window.innerWidth - r.right)}px;`;
		expanded = true;
	}

	function toggle() {
		if (expanded) expanded = false;
		else open();
	}

	function pick(scale: ReciteScale) {
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
	aria-label="따라하기 길이 (현재 {label(value)}배)"
	class="inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-semibold tabular-nums transition-colors {expanded
		? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
		: 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]'}"
>
	{label(value)}
</button>

{#if expanded}
	<div
		class="fixed inset-0 z-[55]"
		onclick={() => (expanded = false)}
		role="presentation"
		aria-hidden="true"
	></div>
	<!-- menuitemradio, not a pressed button: exactly one of the six is in
	     effect, which is what a radio says and what aria-pressed does not. The
	     font-size menu next door still gets this wrong and warns about it at
	     build time. -->
	<div
		role="menu"
		use:menuFocus
		aria-label="따라하기 길이 선택"
		class="fixed z-[60] min-w-[104px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-lg"
		style={popoverStyle}
	>
		{#each RECITE_SCALES as scale (scale)}
			{@const active = Math.abs(value - scale) < 0.001}
			<button
				type="button"
				role="menuitemradio"
				aria-checked={active}
				onclick={() => pick(scale)}
				class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] tabular-nums text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)] {active
					? 'bg-[var(--color-elevated)] font-semibold'
					: ''}"
			>
				{label(scale)}
			</button>
		{/each}
	</div>
{/if}
