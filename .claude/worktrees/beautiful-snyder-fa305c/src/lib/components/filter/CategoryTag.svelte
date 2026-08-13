<script lang="ts">
	interface Props {
		label: string;
		level: 1 | 2;
		active?: boolean;
		interactive?: boolean;
		onclick?: (e: MouseEvent) => void;
	}
	let { label, level, active = false, interactive = true, onclick }: Props = $props();

	const baseClass =
		'inline-flex items-center text-[9.5px] leading-none font-medium px-[7px] py-[3px] rounded-full whitespace-nowrap transition-colors';

	const levelClass = $derived(
		level === 1
			? 'bg-[var(--color-accent)] text-white'
			: 'bg-[var(--color-accent-soft)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
	);

	const activeRing = $derived(active ? 'ring-2 ring-[var(--color-text)] ring-offset-1' : '');
</script>

{#if interactive}
	<button
		type="button"
		class="{baseClass} {levelClass} {activeRing} cursor-pointer"
		aria-pressed={active}
		{onclick}
	>
		{label}
	</button>
{:else}
	<span class="{baseClass} {levelClass}">{label}</span>
{/if}
