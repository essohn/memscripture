<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import type { BookmarkColor } from '$lib/types';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import BookmarkControl from '$lib/components/srs/BookmarkControl.svelte';
	import VerseOverflowMenu from '$lib/components/oyo/VerseOverflowMenu.svelte';
	import DifficultyBadge from '$lib/components/card/DifficultyBadge.svelte';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import { splitVerseWords } from '$lib/utils/chunk';
	import { goto } from '$app/navigation';

	interface Props {
		verse: StoredVerse;
		packageName?: string;
		packageId?: string;
		tags?: VerseTag[];
		bookmark?: BookmarkColor | null;
		onBookmarkPick?: (color: BookmarkColor) => void;
		onBookmarkClear?: () => void;
		/** When false, hide the verse body in read mode. Memorize mode ignores this
		 *  and always renders the body so the curtain UI has something to drag over. */
		showBody?: boolean;
		/** When provided, render an overflow `…` menu with edit/delete actions. OYO only. */
		onEdit?: () => void;
		onDelete?: () => void;
		/** Multiplier applied to every text size inside the card via the --vfs
		 *  CSS variable. 1.0 is the default; the picker offers 0.9 / 1.0 / 1.15 / 1.3. */
		fontScale?: number;
		/** User self-assessment: difficulty of recalling the START of the verse. */
		startDifficulty?: DifficultyLevel | null;
		/** User self-assessment: difficulty of memorizing the WHOLE verse. */
		fullDifficulty?: DifficultyLevel | null;
		onPickStartDifficulty?: (level: DifficultyLevel | null) => void;
		onPickFullDifficulty?: (level: DifficultyLevel | null) => void;
	}
	let {
		verse,
		packageName,
		packageId,
		tags = [],
		bookmark = null,
		onBookmarkPick,
		onBookmarkClear,
		showBody = true,
		onEdit,
		onDelete,
		fontScale = 1.0,
		startDifficulty = null,
		fullDifficulty = null,
		onPickStartDifficulty,
		onPickFullDifficulty
	}: Props = $props();

	const bookmarksEnabled = $derived(Boolean(onBookmarkPick && onBookmarkClear));
	const editingEnabled = $derived(Boolean(onEdit) || Boolean(onDelete));
	const ratingsEnabled = $derived(
		Boolean(onPickStartDifficulty) && Boolean(onPickFullDifficulty)
	);

	// ─── Memorize mode state ──────────────────────────────────────────────
	let mode: 'read' | 'memorize' = $state('read');
	let revealedCount = $state(0);
	// Drag tuning — overwritten on first measure. `pxPerWord` is sized so that
	// one full row-width of horizontal drag reveals exactly one row of words.
	let pxPerWord = 36;
	let wordsPerLine = 5;
	let paragraphEl: HTMLParagraphElement | undefined = $state();

	const words = $derived(splitVerseWords(verse.w));
	const totalWords = $derived(words.length);
	const allRevealed = $derived(revealedCount >= totalWords);

	function enterMemorize() {
		mode = 'memorize';
		// Single-word verses: no curtain to drag, show immediately
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function resetReveal() {
		revealedCount = totalWords <= 1 ? totalWords : 0;
	}
	function revealAll() {
		revealedCount = totalWords;
	}
	function exitMemorize() {
		mode = 'read';
		revealedCount = 0;
	}

	// ─── Pointer-driven curtain drag ──────────────────────────────────────
	let dragBaseline = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragActive = false;
	let dragHorizontal = false;

	function onPointerDown(e: PointerEvent) {
		if (mode !== 'memorize' || totalWords <= 1) return;
		dragBaseline = revealedCount;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragActive = true;
		dragHorizontal = false;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragActive) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;

		// Direction lock: until decided, don't update count
		if (!dragHorizontal) {
			if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
				// Vertical-leaning gesture — release so the page can scroll
				dragActive = false;
				const target = e.currentTarget as Element;
				if (target.hasPointerCapture(e.pointerId)) {
					target.releasePointerCapture(e.pointerId);
				}
				return;
			}
			if (Math.abs(dx) < 4) return;
			dragHorizontal = true;
		}

		// Per-gesture cap: one drag advances at most one row's words in either
		// direction, regardless of how far the pointer travels. The user finishes
		// long verses by lifting and dragging again — keeps reveal speed stable
		// instead of letting a single fast swipe burn through everything.
		const raw = Math.round(dx / pxPerWord);
		const advance =
			raw > wordsPerLine ? wordsPerLine : raw < -wordsPerLine ? -wordsPerLine : raw;
		revealedCount = Math.max(0, Math.min(totalWords, dragBaseline + advance));
	}

	function onPointerUp(e: PointerEvent) {
		dragActive = false;
		const target = e.currentTarget as Element;
		if (target.hasPointerCapture(e.pointerId)) {
			target.releasePointerCapture(e.pointerId);
		}
	}

	// Recompute drag tuning on memorize entry + paragraph resizes.
	// `wordsPerLine` is derived from rendered height/line-height; `pxPerWord` is
	// then set so a full-row-width horizontal drag = one row's worth of words.
	$effect(() => {
		if (mode !== 'memorize' || !paragraphEl || totalWords === 0) return;
		const el = paragraphEl;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			const cs = getComputedStyle(el);
			const fontSize = parseFloat(cs.fontSize) || 17;
			const lhStr = cs.lineHeight;
			const lineHeight =
				lhStr === 'normal'
					? fontSize * 1.4
					: lhStr.endsWith('px')
						? parseFloat(lhStr)
						: fontSize * parseFloat(lhStr);
			const lineCount = Math.max(1, Math.round(rect.height / lineHeight));
			wordsPerLine = Math.max(1, Math.ceil(totalWords / lineCount));
			pxPerWord = rect.width / wordsPerLine;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// ─── Tag click navigation (existing) ──────────────────────────────────
	function tagHref(tag: VerseTag): string {
		if (!packageId) return '#';
		const params = new URLSearchParams();
		params.set('s', String(tag.seriesIndex));
		if (tag.level === 2) {
			params.set('g', String(tag.groupIndex));
		}
		return `/library/${packageId}?${params.toString()}`;
	}

	function onTagClick(tag: VerseTag) {
		goto(tagHref(tag));
	}
</script>

<article
	style="--vfs: {fontScale};"
	class="verse-card relative rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] px-7 pb-9 pt-7"
>
	<header class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<p
				class="text-[calc(11px*var(--vfs))] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]"
			>
				{packageName ?? ''}
			</p>
			<div class="flex items-center gap-1">
				{#if ratingsEnabled}
					<!--
						Two self-assessment badges sit slightly apart from the
						verse-number pill (mr-1 gives the requested separation).
						Order matches the user spec: leftmost = 첫 시작 난이도,
						next = 전체 암송 난이도, then verse number.
					-->
					<div class="mr-1 flex items-center gap-1">
						<DifficultyBadge
							value={startDifficulty}
							label="첫 시작 난이도"
							onpick={onPickStartDifficulty!}
						/>
						<DifficultyBadge
							value={fullDifficulty}
							label="전체 암송 난이도"
							onpick={onPickFullDifficulty!}
						/>
					</div>
				{/if}
				<span
					class="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-accent-soft)] px-2 text-[12px] font-semibold tabular-nums text-[var(--color-accent)]"
				>
					{verse.no}
				</span>
				{#if editingEnabled}
					<VerseOverflowMenu {onEdit} {onDelete} />
				{/if}
			</div>
		</div>
		<h2
			class="text-[calc(22px*var(--vfs))] font-semibold leading-tight text-[var(--color-text)]"
		>
			{verse.title}
		</h2>
		<p
			class="flex items-center gap-2 text-[calc(13px*var(--vfs))] text-[var(--color-text-secondary)]"
		>
			<span class="h-px w-5 bg-[var(--color-accent)]/60"></span>
			{verse.cite}
		</p>
	</header>

	{#if mode === 'read'}
		<!--
			Always render the body so the card height is stable when toggling Eye.
			!showBody just makes the glyphs transparent — layout (line wrap, padding)
			stays identical, screen readers still get the text.
		-->
		<p
			class="mt-6 whitespace-pre-line break-keep text-[calc(17px*var(--vfs))] leading-[1.85] {showBody
				? 'text-[var(--color-text)]'
				: 'text-transparent'}"
		>
			{verse.w}
		</p>
	{:else}
		<p
			class="paragraph mt-6 break-keep text-[calc(17px*var(--vfs))] leading-[2] text-[var(--color-text)] select-none touch-pan-y"
			bind:this={paragraphEl}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			{#each words as word, i (i)}<span
					class="word"
					class:covered={i >= revealedCount}
				>
					<span class="word-text">{word}</span>
				</span>{' '}{/each}
		</p>
		<p
			class="mt-3 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
			aria-hidden={allRevealed}
		>
			{#if allRevealed}&nbsp;{:else}→ 좌→우로 드래그해서 단어를 열어보세요{/if}
		</p>
	{/if}

	{#if tags.length > 0}
		<div class="mt-6 flex flex-wrap gap-1.5">
			{#each tags as tag (tag.level + ':' + tag.seriesIndex + ':' + ('groupIndex' in tag ? tag.groupIndex : -1))}
				<CategoryTag
					label={tag.group.group_name}
					level={tag.level}
					onclick={() => onTagClick(tag)}
				/>
			{/each}
		</div>
	{/if}

	<!-- Mode controls -->
	<div class="mt-6 flex flex-wrap items-center justify-end gap-3 text-[12px]">
		{#if mode === 'read'}
			<button
				type="button"
				onclick={enterMemorize}
				class="inline-flex items-center rounded-full bg-[var(--color-accent)] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
			>
				암송 시작
			</button>
		{:else}
			<button
				type="button"
				onclick={resetReveal}
				class="text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
			>
				처음부터 다시
			</button>
			{#if !allRevealed}
				<span class="text-[var(--color-text-tertiary)]" aria-hidden="true">·</span>
				<button
					type="button"
					onclick={revealAll}
					class="text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
				>
					전체 보기
				</button>
			{/if}
			<span class="text-[var(--color-text-tertiary)]" aria-hidden="true">·</span>
			<button
				type="button"
				onclick={exitMemorize}
				aria-label="암송 종료"
				class="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
			>
				✕
			</button>
		{/if}
	</div>

	{#if bookmarksEnabled}
		<!-- Draping ribbon: anchored at the card's bottom-left, hangs 14px past the bottom edge.
		     The article must be position:relative and not overflow-hidden for this to show. -->
		<div class="absolute -bottom-3.5 left-7">
			<BookmarkControl current={bookmark} onpick={onBookmarkPick!} onclear={onBookmarkClear!} />
		</div>
	{/if}
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}

	.word {
		display: inline-block;
		position: relative;
		padding: 0 2px;
	}
	.word-text {
		transition: opacity 150ms ease;
	}
	.word.covered .word-text {
		opacity: 0;
	}
	.word::after {
		content: '';
		position: absolute;
		inset: 2px 0;
		border-radius: 4px;
		background: repeating-linear-gradient(
			135deg,
			var(--color-border),
			var(--color-border) 4px,
			var(--color-accent-soft) 4px,
			var(--color-accent-soft) 8px
		);
		opacity: 0;
		transition: opacity 150ms ease;
		pointer-events: none;
	}
	.word.covered::after {
		opacity: 1;
	}
</style>
