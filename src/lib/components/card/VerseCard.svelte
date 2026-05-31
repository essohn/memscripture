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
	data-testid="verse-row"
	style="--vfs: {fontScale};"
	class="verse-card relative rounded-[26px] border border-[var(--color-border)] bg-[var(--color-card)] pb-4 pl-7 pr-9 pt-7"
>
	<header class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<p
				class="text-[calc(13px*var(--vfs))] font-medium uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]"
			>
				{packageName ?? ''}
			</p>
			<div class="flex items-center gap-1">
				{#if ratingsEnabled}
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
			class="text-[calc(19px*var(--vfs))] font-bold leading-tight text-[var(--color-text)]"
		>
			{verse.title}
		</h2>
		<p
			class="flex items-center gap-2 text-[calc(19px*var(--vfs))] text-[var(--color-text-secondary)]"
		>
			<span class="h-px w-5 bg-[var(--color-accent)]/60"></span>
			{verse.cite}
		</p>
	</header>

	<!--
		Always render the body so the card height is stable when toggling Eye.
		!showBody just makes the glyphs transparent — layout (line wrap, padding)
		stays identical, screen readers still get the text.
	-->
	<p
		class="mt-6 whitespace-pre-line break-keep text-[calc(19px*var(--vfs))] leading-[1.85] {showBody
			? 'text-[var(--color-text)]'
			: 'text-transparent'}"
	>
		{verse.w}
	</p>

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

	{#if bookmarksEnabled}
		<!-- Draping ribbon: anchored at the card's bottom-right, hangs ~8px past the
		     bottom edge. right-9 aligns the ribbon roughly with the body's right edge
		     instead of overhanging it. The article must be position:relative and not
		     overflow-hidden for this to show. -->
		<div class="absolute -bottom-2 right-9">
			<BookmarkControl current={bookmark} onpick={onBookmarkPick!} onclear={onBookmarkClear!} />
		</div>
	{/if}
</article>

<style>
	.verse-card {
		box-shadow: var(--shadow-card);
	}
</style>
