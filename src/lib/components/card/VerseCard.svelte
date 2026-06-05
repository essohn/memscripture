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
			selectable ? 'cursor-pointer select-none' : '',
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
	role={selectable ? 'button' : undefined}
	tabindex={selectable ? 0 : undefined}
	aria-pressed={selectable ? selected : undefined}
	onclick={selectable ? handleCardClick : undefined}
	onkeydown={selectable ? handleCardKey : undefined}
>
	<header class="space-y-1">
		<div class="flex items-start justify-between gap-3">
			<h2
				class="min-w-0 flex-1 text-[calc(19px*var(--vfs))] font-bold leading-tight text-[var(--color-text)]"
			>
				{verse.title}
			</h2>
			{#if ratingsEnabled || editingEnabled}
				<div class="flex shrink-0 items-center gap-1">
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
					{#if editingEnabled}
						<VerseOverflowMenu {onEdit} {onDelete} />
					{/if}
				</div>
			{/if}
		</div>
		<p class="text-[calc(19px*var(--vfs))] text-[var(--color-text-secondary)]">
			{verse.cite}
		</p>
	</header>

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
</style>
