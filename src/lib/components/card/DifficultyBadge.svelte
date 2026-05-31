<script lang="ts">
	import {
		DIFFICULTY_COLORS,
		DIFFICULTY_LABELS,
		DIFFICULTY_LEVELS,
		type DifficultyLevel
	} from '$lib/db/verseRatings';

	interface Props {
		/** Currently stored level, or null when the user hasn't rated yet. */
		value: DifficultyLevel | null;
		/** Tooltip / aria-label hint that says what this badge represents
		 *  ("첫 시작 난이도" or "전체 암송 난이도"). */
		label: string;
		onpick: (level: DifficultyLevel | null) => void;
	}
	let { value, label, onpick }: Props = $props();

	let expanded = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let popoverStyle = $state('');

	function open() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		// Drop below the badge, right-anchor so the popover doesn't run off
		// the viewport edge on small screens.
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

	function pick(level: DifficultyLevel) {
		// Tapping the current level clears it — same affordance as the
		// bookmark ribbon picker.
		onpick(value === level ? null : level);
		expanded = false;
	}

	function clear() {
		onpick(null);
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
	aria-label={value === null
		? `${label} (설정 안 됨)`
		: `${label} ${value} ${DIFFICULTY_LABELS[value]} (변경)`}
	style={value === null
		? 'border: 1.5px dashed var(--color-border); color: var(--color-text-tertiary);'
		: `background-color: ${DIFFICULTY_COLORS[value]}; color: white;`}
	class="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums transition-opacity hover:opacity-85"
>
	{value ?? '·'}
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
		aria-label={`${label} 선택`}
		class="popover fixed z-[60] min-w-[160px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-lg"
		style={popoverStyle}
	>
		<p
			class="px-3 pb-1 pt-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
		>
			{label}
		</p>
		{#each DIFFICULTY_LEVELS as level (level)}
			{@const active = value === level}
			<button
				type="button"
				role="menuitemradio"
				aria-checked={active}
				onclick={() => pick(level)}
				class="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-elevated)] {active
					? 'bg-[var(--color-elevated)] font-semibold'
					: ''}"
			>
				<span
					style={`background-color: ${DIFFICULTY_COLORS[level]}; color: white;`}
					class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums"
				>
					{level}
				</span>
				<span>{DIFFICULTY_LABELS[level]}</span>
			</button>
		{/each}
		{#if value !== null}
			<button
				type="button"
				role="menuitem"
				onclick={clear}
				class="mt-1 flex w-full items-center gap-3 border-t border-[var(--color-border)] px-3 py-2 text-left text-[12px] font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-elevated)]"
			>
				지우기
			</button>
		{/if}
	</div>
{/if}
