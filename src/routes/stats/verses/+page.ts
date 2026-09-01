import {
	buildEventCardById,
	parseStatsLevel,
	versesAtLevel,
	versesByPerfection,
	type EventVerseRef,
	type StatsDimension
} from '$lib/db/events';
import { todayLocalKey } from '$lib/db/activity';
import { installPackage, listPackages, listVerses, loadPackageData } from '$lib/db/verses';
import { listAllBookmarks } from '$lib/db/bookmarks';
import { listMarksForPackage } from '$lib/db/verseMarks';
import { listPerfectVerseNos } from '$lib/db/checkHistory';
import type { StoredMark } from '$lib/memorize/marks';
import type { VerseTag } from '$lib/db/verses';
import type { BookmarkColor } from '$lib/types';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { StoredVerse } from '$lib/db/local';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface StatsVerseRow {
	verse: StoredVerse;
	packageId: string;
	packageName: string;
	/** The rest of what a card shows. Gathered here so this list renders the
	 *  same card as the library list — the reader should not be able to tell
	 *  which door they came through. */
	bookmark: BookmarkColor | null;
	marks: StoredMark[];
	perfect: boolean;
	tags: VerseTag[];
}

export interface StatsVersesLoadData {
	eventTitle: string;
	/** 'perfect' asks about the last check rather than a difficulty rating. */
	dim: StatsDimension | 'perfect';
	/** For a difficulty dimension: the level, or null for 미평가. For 'perfect':
	 *  true is 완벽 and false is the remainder. */
	level: DifficultyLevel | null;
	perfect: boolean;
	rows: StatsVerseRow[];
}

function parseDim(raw: string | null): StatsDimension {
	return raw === 'full' ? 'full' : 'start';
}

export const load: PageLoad = async ({ url }): Promise<StatsVersesLoadData> => {
	const rawDim = url.searchParams.get('dim');
	const rawLevel = url.searchParams.get('level');
	const isPerfect = rawDim === 'perfect';
	const dim = isPerfect ? ('perfect' as const) : parseDim(rawDim);
	const level = isPerfect ? null : parseStatsLevel(rawLevel);
	// Only an explicit yes asks for the flawless ones; anything else is the
	// remainder, which is the safer default for a hand-edited URL.
	const perfect = rawLevel === 'yes';
	const eventId = url.searchParams.get('event') ?? '';

	// Resolved through the card builder rather than the raw event so this page
	// sees exactly the ranges the chart was built from — same group visibility,
	// same dropped-because-uninstalled ranges. A list that disagreed with the
	// bar it was opened from would be worse than no list.
	//
	// By id rather than by filtering today's: this page is also how a finished
	// 암송 DAY is looked back at, and the old route filtered by date first, so
	// every link into a DAY whose deadline had passed came back empty.
	const card = await buildEventCardById(eventId, todayLocalKey());
	if (!card) return { eventTitle: '', dim, level, perfect, rows: [] };

	const refs: EventVerseRef[] = isPerfect
		? await versesByPerfection(card.ranges, perfect)
		: await versesAtLevel(card.ranges, dim as StatsDimension, level);
	if (refs.length === 0) return { eventTitle: card.eventTitle, dim, level, perfect, rows: [] };

	const packageIds = Array.from(new Set(refs.map((r) => r.packageId)));
	await Promise.all(packageIds.map((id) => installPackage(id).catch(() => {})));

	const [packages, versesPerPackage, bookmarks, marksPerPackage, perfectPerPackage, dataPerPackage] =
		await Promise.all([
			listPackages(),
			Promise.all(packageIds.map((id) => listVerses(id))),
			listAllBookmarks().catch(() => []),
			Promise.all(packageIds.map((id) => listMarksForPackage(id).catch(() => new Map()))),
			Promise.all(packageIds.map((id) => listPerfectVerseNos(id).catch(() => new Set<number>()))),
			// Tags come from the package's own group index, so they are per
			// package even though this list spans several.
			Promise.all(packageIds.map((id) => loadPackageData(id).catch(() => null)))
		]);

	const marksByPackage = new Map(packageIds.map((id, i) => [id, marksPerPackage[i]]));
	const perfectByPackage = new Map(packageIds.map((id, i) => [id, perfectPerPackage[i]]));
	const tagsByPackage = new Map(packageIds.map((id, i) => [id, dataPerPackage[i]?.tagsByVerseNo]));
	const bookmarkByKey = new Map(bookmarks.map((b) => [`${b.packageId}:${b.verseNo}`, b.color]));

	// Abbreviation, so the package label reads the same here as on the library
	// detail and the bookmarks list.
	const nameById = new Map(packages.map((p) => [p.id, p.abbreviation]));
	const verseByKey = new Map<string, StoredVerse>();
	for (const v of versesPerPackage.flat()) verseByKey.set(`${v.package_id}:${v.no}`, v);

	const rows: StatsVerseRow[] = [];
	for (const ref of refs) {
		const verse = verseByKey.get(`${ref.packageId}:${ref.verseNo}`);
		if (!verse) continue;
		rows.push({
			verse,
			packageId: ref.packageId,
			packageName: nameById.get(ref.packageId) ?? ref.packageId,
			bookmark: bookmarkByKey.get(`${ref.packageId}:${ref.verseNo}`) ?? null,
			marks: marksByPackage.get(ref.packageId)?.get(ref.verseNo) ?? [],
			perfect: perfectByPackage.get(ref.packageId)?.has(ref.verseNo) ?? false,
			tags: tagsByPackage.get(ref.packageId)?.get(ref.verseNo) ?? []
		});
	}

	return { eventTitle: card.eventTitle, dim, level, perfect, rows };
};
