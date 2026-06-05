<script lang="ts">
	import { X } from 'lucide-svelte';
	import { BOOKMARK_COLORS, type BookmarkColor } from '$lib/types';

	interface Props {
		current: BookmarkColor | null;
		onpick: (color: BookmarkColor) => void;
		onclear: () => void;
	}
	let { current, onpick, onclear }: Props = $props();

	let expanded = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let popoverStyle = $state('');

	const COLOR_LABELS: Record<BookmarkColor, string> = {
		red: '빨강',
		amber: '주황',
		green: '초록',
		blue: '파랑',
		purple: '보라'
	};

	function open() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		// Drop below the ribbon's bottom tip. Anchor toward whichever side the
		// trigger sits on so the popover stays on-screen — left-anchored for a
		// bottom-left ribbon, right-anchored when it's near the right edge.
		const anchorLeft = rect.left < window.innerWidth / 2;
		const side = anchorLeft
			? `left: ${Math.max(8, rect.left)}px`
			: `right: ${Math.max(8, window.innerWidth - rect.right)}px`;
		popoverStyle = `top: ${rect.bottom + 8}px; ${side};`;
		expanded = true;
	}

	function toggle() {
		if (expanded) expanded = false;
		else open();
	}

	function pick(c: BookmarkColor) {
		if (current === c) onclear();
		else onpick(c);
		expanded = false;
	}

	function clear() {
		onclear();
		expanded = false;
	}

	function onKey(e: KeyboardEvent) {
		if (expanded && e.key === 'Escape') expanded = false;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="bookmark-control">
	<button
		bind:this={triggerEl}
		type="button"
		onclick={toggle}
		aria-haspopup="menu"
		aria-expanded={expanded}
		aria-label={current ? `${COLOR_LABELS[current]} 리본 (변경)` : '북마크 추가'}
		class="ribbon-trigger block transition-opacity hover:opacity-85"
	>
		<svg
			viewBox="0 0 26 50"
			width="26"
			height="50"
			aria-hidden="true"
			focusable="false"
		>
			<!--
				Rounded top (radius 4): start offset by r, arc into the top-right
				corner. The notch tip stays at the horizontal midpoint, ~8px above
				the bottom edge.
			-->
			<path
				d="M4 0 H22 A4 4 0 0 1 26 4 V50 L13 42 L0 50 V4 A4 4 0 0 1 4 0 Z"
				fill={current ? `var(--color-ribbon-${current})` : 'transparent'}
				stroke={current ? 'none' : 'var(--color-text-tertiary)'}
				stroke-width="1.25"
				stroke-dasharray={current ? undefined : '3 2.5'}
				stroke-opacity={current ? undefined : '0.55'}
			/>
		</svg>
	</button>

	{#if expanded}
		<!-- Backdrop: catches outside clicks. Above TabBar (z-50) and Header (z-40). -->
		<div
			class="fixed inset-0 z-[55]"
			onclick={() => (expanded = false)}
			role="presentation"
			aria-hidden="true"
		></div>

		<div
			role="menu"
			aria-label="북마크 색상 선택"
			class="popover fixed z-[60] rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3"
			style={popoverStyle}
		>
			<div class="flex items-center gap-3">
				<div role="group" aria-label="리본 색상" class="flex items-center gap-2">
					{#each BOOKMARK_COLORS as c (c)}
						{@const active = current === c}
						<button
							type="button"
							onclick={() => pick(c)}
							aria-label={`${COLOR_LABELS[c]} 리본`}
							aria-pressed={active}
							class="ribbon-dot relative h-7 w-7 rounded-full transition-transform hover:scale-110"
							style="background-color: var(--color-ribbon-{c});"
						>
							{#if active}
								<span
									class="absolute inset-0 rounded-full"
									style="box-shadow: 0 0 0 2px var(--color-card), 0 0 0 4px var(--color-ribbon-{c});"
								></span>
							{/if}
						</button>
					{/each}
				</div>
				<div class="ml-1 flex items-center gap-1 border-l border-[var(--color-border)] pl-3">
					{#if current}
						<button
							type="button"
							onclick={clear}
							aria-label="북마크 지우기"
							class="rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-elevated)]"
						>
							지우기
						</button>
					{/if}
					<button
						type="button"
						onclick={() => (expanded = false)}
						aria-label="닫기"
						class="p-1 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
					>
						<X size={16} strokeWidth={1.75} />
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.popover {
		box-shadow: var(--shadow-popover);
	}
	.ribbon-trigger {
		line-height: 0;
	}
	/* drop-shadow follows the V-notch silhouette; box-shadow would draw a rectangle. */
	.ribbon-trigger svg {
		filter: drop-shadow(0 1px 1.5px rgba(58, 46, 37, 0.18))
			drop-shadow(0 3px 4px rgba(58, 46, 37, 0.12));
	}
	:global(.theme-dark) .ribbon-trigger svg {
		filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.4))
			drop-shadow(0 3px 4px rgba(0, 0, 0, 0.3));
	}
</style>
