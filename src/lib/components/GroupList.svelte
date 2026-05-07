<script lang="ts">
	import type { StoredVerse } from '$lib/db/local';
	import type { VerseTag } from '$lib/db/verses';
	import { ChevronRight } from 'lucide-svelte';
	import CategoryTag from './filter/CategoryTag.svelte';

	interface Props {
		packageId: string;
		verses: StoredVerse[];
		/** Tags to render inline per verse number. Pass empty map to suppress (e.g. flat packages). */
		tagsByVerseNo: Map<number, VerseTag[]>;
		/** Currently active filter — used to highlight matching tags. */
		activeSeriesIndex: number | null;
		activeGroupIndices: number[];
		onTagClick: (tag: VerseTag) => void;
	}
	let {
		packageId,
		verses,
		tagsByVerseNo,
		activeSeriesIndex,
		activeGroupIndices,
		onTagClick
	}: Props = $props();
</script>

<ul
	class="group-list overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
>
	{#each verses as v, i (v.no)}
		{@const tags = tagsByVerseNo.get(v.no) ?? []}
		<li class:border-t={i > 0} class="border-[var(--color-border)]">
			<div class="verse-row group flex items-stretch gap-3 px-5 py-3 transition-colors">
				<a
					data-testid="verse-row"
					href={`/library/${packageId}/${v.no}`}
					class="row-link flex flex-1 items-center gap-3 min-w-0"
				>
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[13px] font-semibold tabular-nums text-[var(--color-accent)] transition-colors group-hover:bg-[var(--color-accent)] group-hover:text-white"
					>
						{v.no}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-medium text-[var(--color-text)]">{v.title}</p>
						<p class="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{v.cite}</p>
						{#if tags.length > 0}
							<div class="mt-1.5 flex flex-wrap gap-1.5">
								{#each tags as tag (tag.level + ':' + tag.seriesIndex + ':' + ('groupIndex' in tag ? tag.groupIndex : -1))}
									{@const active =
										tag.level === 1
											? activeSeriesIndex === tag.seriesIndex
											: activeSeriesIndex === tag.seriesIndex &&
												activeGroupIndices.includes(tag.groupIndex)}
									<CategoryTag
										label={tag.group.group_name}
										level={tag.level}
										{active}
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onTagClick(tag);
										}}
									/>
								{/each}
							</div>
						{/if}
					</div>
					<ChevronRight
						size={18}
						class="shrink-0 self-center text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
					/>
				</a>
			</div>
		</li>
	{/each}
</ul>

<style>
	.group-list {
		box-shadow: var(--shadow-soft);
	}
	.verse-row:hover {
		background-color: var(--color-elevated);
	}
</style>
