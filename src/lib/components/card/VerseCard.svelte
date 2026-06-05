<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import type { BookmarkColor } from '$lib/types';
	import CategoryTag from '$lib/components/filter/CategoryTag.svelte';
	import BookmarkControl from '$lib/components/srs/BookmarkControl.svelte';
	import VerseOverflowMenu from '$lib/components/oyo/VerseOverflowMenu.svelte';
	import DifficultyBadge from '$lib/components/card/DifficultyBadge.svelte';
	import type { DifficultyLevel } from '$lib/db/verseRatings';
	import { goto } from '$app/navigation';

	interface Props {
		verse: StoredVerse;
		packageName?: string;
		packageId?: string;
		tags?: VerseTag[];
		bookmark?: BookmarkColor | null;
		onBookmarkPick?: (color: BookmarkColor) => void;
		onBookmarkClear?: () => void;
		/** When false, hide the verse body in read mode. */
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
		/** Multi-select (package list): true when this card is in the selected set. */
		selected?: boolean;
		/** Multi-select: dim this card because another card is selected and this one isn't. */
		dimmed?: boolean;
		/** When provided, tapping the card body toggles its selection. */
		onToggleSelect?: () => void;
		/** Transient flash to draw the eye when the list is deep-linked to this verse. */
		highlighted?: boolean;
		/** When set, the package label becomes a link (e.g. back to the package list). */
		packageHref?: string;
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
		onPickFullDifficulty,
		selected = false,
		dimmed = false,
		onToggleSelect,
		highlighted = false,
		packageHref
	}: Props = $props();

	const bookmarksEnabled = $derived(Boolean(onBookmarkPick && onBookmarkClear));
	const editingEnabled = $derived(Boolean(onEdit) || Boolean(onDelete));
	const ratingsEnabled = $derived(
		Boolean(onPickStartDifficulty) && Boolean(onPickFullDifficulty)
	);
	const selectable = $derived(Boolean(onToggleSelect));

	// ─── Memorize mode: drag a curtain left→right to reveal words one at a time ──
	let mode = $state<'read' | 'memorize'>('read');
	// While memorizing, the card stops acting as a select target so drags reveal
	// words instead of toggling the selection.
	const interactive = $derived(selectable && mode === 'read');

	let revealedCount = $state(0);
	// Drag tuning — overwritten on first measure. `pxPerWord` is sized so one full
	// row-width of horizontal drag reveals exactly one row of words.
	let pxPerWord = 36;
	let wordsPerLine = 5;
	let paragraphEl: HTMLParagraphElement | undefined = $state();

	const words = $derived(verse.w.split(/\s+/).filter(Boolean));
	const totalWords = $derived(words.length);
	const allRevealed = $derived(revealedCount >= totalWords);

	function enterMemorize() {
		mode = 'memorize';
		// Single-word verses have no curtain to drag — show immediately.
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
		// Direction lock: a vertical-leaning gesture releases so the page scrolls.
		if (!dragHorizontal) {
			if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
				dragActive = false;
				const t = e.currentTarget as Element;
				if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
				return;
			}
			if (Math.abs(dx) < 4) return;
			dragHorizontal = true;
		}
		// Cap one drag to a single row's words either way, so a fast swipe can't
		// burn through a long verse — lift and drag again to continue.
		const raw = Math.round(dx / pxPerWord);
		const advance = raw > wordsPerLine ? wordsPerLine : raw < -wordsPerLine ? -wordsPerLine : raw;
		revealedCount = Math.max(0, Math.min(totalWords, dragBaseline + advance));
	}

	function onPointerUp(e: PointerEvent) {
		dragActive = false;
		const t = e.currentTarget as Element;
		if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
	}

	// Recompute drag tuning on memorize entry + paragraph resizes. `wordsPerLine`
	// comes from rendered height / line-height; `pxPerWord` is then sized so a
	// full-row-width drag reveals one row's worth of words.
	$effect(() => {
		if (mode !== 'memorize' || !paragraphEl || totalWords === 0) return;
		const el = paragraphEl;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			const cs = getComputedStyle(el);
			const fontSize = parseFloat(cs.fontSize) || 19;
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

	// The card hosts its own interactive controls (bookmark ribbon, difficulty
	// badges, tags) plus their full-screen popover backdrops. Selection-toggle
	// must ignore clicks that originate from any of those — match the elements
	// and ARIA roles they render so a tap on a control never flips selection.
	// The card itself also carries role="button" when selectable, so the match
	// is only treated as a control when it's something *other than* the card.
	function innerControlClicked(e: MouseEvent): boolean {
		const el = e.target as HTMLElement | null;
		const hit = el?.closest(
			'button, a, [role="button"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="presentation"], [role="group"]'
		);
		return Boolean(hit && hit !== e.currentTarget);
	}

	function handleCardClick(e: MouseEvent) {
		if (!onToggleSelect || innerControlClicked(e)) return;
		onToggleSelect();
	}

	function handleCardKey(e: KeyboardEvent) {
		if (!onToggleSelect) return;
		// Only the card itself toggles on Enter/Space — let inner controls keep
		// their own keyboard behaviour.
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onToggleSelect();
		}
	}

	const cardClass = $derived(
		[
			'verse-card relative rounded-[14px] border bg-[var(--color-card)] px-5 py-5 transition-[opacity,border-color,box-shadow] duration-200',
			selected
				? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]'
				: 'border-[var(--color-border)]',
			dimmed ? 'opacity-50' : '',
			interactive ? 'cursor-pointer select-none' : '',
			highlighted ? 'verse-card--highlight' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

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

<!-- role/tabindex are applied dynamically (button only when selectable); the
     static a11y check can't see that, so the noninteractive-tabindex rule is a
     false positive here. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article
	data-testid="verse-row"
	style="--vfs: {fontScale};"
	class={cardClass}
	role={interactive ? 'button' : undefined}
	tabindex={interactive ? 0 : undefined}
	aria-pressed={interactive ? selected : undefined}
	onclick={interactive ? handleCardClick : undefined}
	onkeydown={interactive ? handleCardKey : undefined}
>
	<header class="space-y-1">
		<div class="flex items-start justify-between gap-3">
			<h2
				class="min-w-0 flex-1 text-[calc(19px*var(--vfs))] font-bold leading-tight text-[var(--color-text)]"
			>
				{verse.title}
			</h2>
			<div class="flex shrink-0 items-center gap-1">
				{#if mode === 'read'}
					{#if ratingsEnabled}
						<div class="flex items-center gap-1">
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
					<button
						type="button"
						onclick={enterMemorize}
						class="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-90"
					>
						암송
					</button>
					{#if editingEnabled}
						<VerseOverflowMenu {onEdit} {onDelete} />
					{/if}
				{:else}
					<button
						type="button"
						onclick={exitMemorize}
						aria-label="암송 종료"
						class="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
					>
						✕
					</button>
				{/if}
			</div>
		</div>
		<p class="text-[calc(19px*var(--vfs))] text-[var(--color-text-secondary)]">
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
			class="mt-1.5 whitespace-pre-line break-keep text-[calc(19px*var(--vfs))] leading-[1.6] {showBody
				? 'text-[var(--color-text)]'
				: 'text-transparent'}"
		>
			{verse.w}
		</p>
	{:else}
		<!-- Memorize curtain: words start covered; drag left→right to reveal them. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<p
			bind:this={paragraphEl}
			class="memorize-body mt-1.5 break-keep text-[calc(19px*var(--vfs))] leading-[1.9] text-[var(--color-text)] select-none touch-pan-y"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>{#each words as word, i (i)}<span class="word" class:covered={i >= revealedCount}><span class="word-text">{word}</span></span>{' '}{/each}</p>
		<div class="mt-3 flex items-center justify-between gap-3 text-[11px]">
			<span class="text-[var(--color-text-tertiary)]">
				{#if allRevealed}모두 열렸습니다{:else}← 좌→우로 드래그해서 단어 열기{/if}
			</span>
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={resetReveal}
					class="font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
				>
					처음부터
				</button>
				{#if !allRevealed}
					<button
						type="button"
						onclick={revealAll}
						class="font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
					>
						전체 보기
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Bottom meta row: package name + tags. The verse number and bookmark ribbon
	     sit together at the bottom-right (ribbon immediately left of the number);
	     pr reserves space so the tags don't run under them. -->
	<div class="mt-3 flex flex-wrap items-center gap-2 {bookmarksEnabled ? 'pr-20' : 'pr-12'}">
		{#if packageName}
			{#if packageHref}
				<a
					href={packageHref}
					class="text-[calc(11px*var(--vfs))] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
				>
					{packageName}
				</a>
			{:else}
				<span
					class="text-[calc(11px*var(--vfs))] font-medium uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]"
				>
					{packageName}
				</span>
			{/if}
		{/if}
		{#each tags as tag (tag.level + ':' + tag.seriesIndex + ':' + ('groupIndex' in tag ? tag.groupIndex : -1))}
			<CategoryTag label={tag.group.group_name} level={tag.level} onclick={() => onTagClick(tag)} />
		{/each}
	</div>

	<!-- Verse number: small, pinned to the bottom-right corner. -->
	<span
		class="absolute bottom-5 right-5 w-7 text-right text-[calc(13px*var(--vfs))] font-semibold tabular-nums text-[var(--color-text-tertiary)]"
	>
		{verse.no}
	</span>

	{#if bookmarksEnabled}
		<!-- Draping ribbon, immediately left of the verse number. Hangs ~8px past the
		     bottom edge; the article must be position:relative and not overflow-hidden. -->
		<div class="absolute -bottom-2 right-[3.25rem]">
			<BookmarkControl current={bookmark} onpick={onBookmarkPick!} onclear={onBookmarkClear!} />
		</div>
	{/if}
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}
	/* One-shot flash when the list is deep-linked to this verse. Reverts to the
	   base card styling once the animation completes (no fill-forwards). */
	.verse-card--highlight {
		animation: verse-card-flash 1.7s ease-out;
	}
	@keyframes verse-card-flash {
		0% {
			background-color: var(--color-accent-soft);
			box-shadow: 0 0 0 3px var(--color-accent), var(--shadow-card);
		}
		60% {
			background-color: var(--color-card);
		}
		100% {
			box-shadow: var(--shadow-card);
		}
	}

	/* Memorize-mode curtain: each word sits under a striped cover until revealed. */
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
