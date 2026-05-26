<script lang="ts">
	import { Bookmark, BookmarkCheck, X } from 'lucide-svelte';
	import { BOOKMARK_COLORS, type BookmarkColor } from '$lib/types';

	interface Props {
		current: BookmarkColor | null;
		onpick: (color: BookmarkColor) => void;
		onclear: () => void;
	}
	let { current, onpick, onclear }: Props = $props();

	let expanded = $state(false);

	const COLOR_LABELS: Record<BookmarkColor, string> = {
		red: '빨강',
		amber: '주황',
		green: '초록',
		blue: '파랑',
		purple: '보라'
	};

	function pick(c: BookmarkColor) {
		if (current === c) {
			onclear();
		} else {
			onpick(c);
		}
		expanded = false;
	}

	function clear() {
		onclear();
		expanded = false;
	}

	function onKey(e: KeyboardEvent) {
		if (expanded && e.key === 'Escape') {
			expanded = false;
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="bookmark-control relative">
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		aria-haspopup="menu"
		aria-expanded={expanded}
		aria-label={current ? `${COLOR_LABELS[current]} 리본 (변경)` : '북마크 추가'}
		class="inline-flex items-center justify-center gap-1.5 rounded-md p-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-elevated)]"
	>
		{#if current}
			<BookmarkCheck size={18} strokeWidth={2} color={`var(--color-ribbon-${current})`} />
			<span style="color: var(--color-ribbon-{current})">{COLOR_LABELS[current]}</span>
		{:else}
			<Bookmark size={18} strokeWidth={1.75} color="var(--color-text-tertiary)" />
		{/if}
	</button>

	{#if expanded}
		<!-- backdrop catches outside clicks; transparent -->
		<div
			class="fixed inset-0 z-20"
			onclick={() => (expanded = false)}
			role="presentation"
			aria-hidden="true"
		></div>

		<div
			role="menu"
			aria-label="북마크 색상 선택"
			class="popover absolute left-0 top-full z-30 mt-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3"
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
</style>
