<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import ListenBar from '$lib/components/player/ListenBar.svelte';
	import ListenButtons from '$lib/components/player/ListenButtons.svelte';
	import { PlaylistPlayer } from '$lib/state/playlistPlayer.svelte';
	import VerseCard from '$lib/components/card/VerseCard.svelte';
	import { verseVisibility } from '$lib/state/verseVisibility.svelte';
	import { fontScale } from '$lib/state/fontScale.svelte';
	import {
		getVerseRating,
		setStartDifficulty,
		setFullDifficulty,
		type DifficultyLevel
	} from '$lib/db/verseRatings';
	import { ratedLevel, statsListHeading } from '$lib/db/events';
	import { listLastCheckedAt, verseKeyOf } from '$lib/db/checkHistory';
	import { setBookmark, clearBookmark } from '$lib/db/bookmarks';
	import { toggleVerseMark } from '$lib/db/verseMarks';
	import type { BookmarkColor } from '$lib/types';
	import type { StoredMark } from '$lib/memorize/marks';
	import type { StatsVersesLoadData } from './+page';

	let { data }: { data: StatsVersesLoadData } = $props();

	const showVerseText = $derived(verseVisibility.shown);

	// Composite-keyed, like the bookmarks list: this page spans packages, so a
	// verse number alone is not unique.
	let startDifficulties = $state<Record<string, DifficultyLevel | null>>({});
	let fullDifficulties = $state<Record<string, DifficultyLevel | null>>({});
	let lastCheckedByKey = $state<Map<string, number>>(new Map());

	const heading = $derived(statsListHeading(data.dim, data.level, data.perfect));

	/*
	 * This list is already the answer to a question the reader asked from the
	 * home chart — 시작 난이도 xHard, 전체 일치 Hard — and the useful next move
	 * on a set they have just called hard is to hear it.
	 *
	 * Its own player, one per screen: there is one synthesizer, and a page with
	 * a single list has a single thing to play.
	 */
	const player = new PlaylistPlayer();
	$effect(() => {
		void player.load();
		return () => player.destroy();
	});
	const listenVerses = $derived(
		data.rows.map((r) => ({ title: r.verse.title, cite: r.verse.cite, w: r.verse.w }))
	);

	$effect(() => {
		const rows = data.rows;
		void (async () => {
			// Unscoped: this list spans packages, so one scan of the whole table
			// beats one per package it happens to include.
			const [ratings, lastChecked] = await Promise.all([
				Promise.all(rows.map((r) => getVerseRating(r.packageId, r.verse.no))),
				listLastCheckedAt()
			]);
			lastCheckedByKey = lastChecked;
			const start: Record<string, DifficultyLevel | null> = {};
			const full: Record<string, DifficultyLevel | null> = {};
			rows.forEach((r, i) => {
				const key = verseKeyOf(r.packageId, r.verse.no);
				start[key] = ratedLevel(ratings[i], 'start');
				full[key] = ratedLevel(ratings[i], 'full');
			});
			startDifficulties = start;
			fullDifficulties = full;
		})();
	});

	/**
	 * Rating from this screen is deliberately not re-filtered.
	 *
	 * The list is the answer to a question asked on the home page. Re-running
	 * that query as the reader rates would make cards vanish under the finger
	 * that just rated them, and a list that empties itself is a worse place to
	 * work than one that goes briefly stale.
	 */
	function pickStart(packageId: string, verseNo: number, level: DifficultyLevel | null) {
		startDifficulties = { ...startDifficulties, [verseKeyOf(packageId, verseNo)]: level };
		setStartDifficulty(packageId, verseNo, level).catch(() => {});
	}

	function pickFull(packageId: string, verseNo: number, level: DifficultyLevel | null) {
		fullDifficulties = { ...fullDifficulties, [verseKeyOf(packageId, verseNo)]: level };
		setFullDifficulty(packageId, verseNo, level).catch(() => {});
	}

	// Bookmarks and underlines are written straight through and mirrored
	// locally, the same way the library list does it: the card should respond
	// to the tap, not to the round trip.
	let bookmarks = $state<Record<string, BookmarkColor | null>>({});
	let marks = $state<Record<string, StoredMark[]>>({});

	$effect(() => {
		const next: Record<string, BookmarkColor | null> = {};
		const nextMarks: Record<string, StoredMark[]> = {};
		for (const r of data.rows) {
			next[verseKeyOf(r.packageId, r.verse.no)] = r.bookmark;
			nextMarks[verseKeyOf(r.packageId, r.verse.no)] = r.marks;
		}
		bookmarks = next;
		marks = nextMarks;
	});

	function pickBookmark(packageId: string, verseNo: number, color: BookmarkColor) {
		bookmarks = { ...bookmarks, [verseKeyOf(packageId, verseNo)]: color };
		setBookmark(packageId, verseNo, color).catch(() => {});
	}

	function removeBookmark(packageId: string, verseNo: number) {
		bookmarks = { ...bookmarks, [verseKeyOf(packageId, verseNo)]: null };
		clearBookmark(packageId, verseNo).catch(() => {});
	}

	function onToggleMark(packageId: string, verseNo: number, index: number, word: string) {
		const key = verseKeyOf(packageId, verseNo);
		void toggleVerseMark(packageId, verseNo, index, word)
			.then((next) => (marks = { ...marks, [key]: next }))
			.catch(() => {});
	}

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else location.href = '/';
	}
</script>

<Header title={heading} onBack={goBack} />

<ListenBar {player} />

<main class="mx-auto max-w-2xl px-5 pb-24 pt-4">
	{#if data.rows.length === 0}
		<p class="pt-12 text-center text-[var(--color-text-tertiary)]">
			해당하는 구절이 없습니다.
		</p>
	{:else}
		<!-- Beside the count, which is the line that already says what this list
		     is. The buttons answer "and now?" in the same breath. -->
		<div class="mb-4 flex items-center gap-2 px-1">
			<p class="min-w-0 flex-1 text-[12px] text-[var(--color-text-secondary)]">
				{data.eventTitle} · <span class="tabular-nums">{data.rows.length}</span>구절
			</p>
			<ListenButtons {player} id="stats:{data.dim}:{data.level}" title={heading} verses={listenVerses} />
		</div>
		<div class="space-y-5">
			{#each data.rows as row (verseKeyOf(row.packageId, row.verse.no))}
				<VerseCard
					verse={row.verse}
					packageName={row.packageName}
					packageId={row.packageId}
					tags={row.tags}
					bookmark={bookmarks[verseKeyOf(row.packageId, row.verse.no)] ?? null}
					onBookmarkPick={(c) => pickBookmark(row.packageId, row.verse.no, c)}
					onBookmarkClear={() => removeBookmark(row.packageId, row.verse.no)}
					marks={marks[verseKeyOf(row.packageId, row.verse.no)] ?? []}
					onToggleMark={(i, word) => onToggleMark(row.packageId, row.verse.no, i, word)}
					perfect={row.perfect}
					startDifficulty={startDifficulties[verseKeyOf(row.packageId, row.verse.no)] ?? null}
					fullDifficulty={fullDifficulties[verseKeyOf(row.packageId, row.verse.no)] ?? null}
					onPickStartDifficulty={(l) => pickStart(row.packageId, row.verse.no, l)}
					onPickFullDifficulty={(l) => pickFull(row.packageId, row.verse.no, l)}
					showBody={showVerseText}
					fontScale={fontScale.value}
					lastCheckedAt={lastCheckedByKey.get(verseKeyOf(row.packageId, row.verse.no)) ?? null}
				/>
			{/each}
		</div>
	{/if}
</main>
