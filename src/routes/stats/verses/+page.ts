import {
	buildEventCards,
	versesAtLevel,
	versesByPerfection,
	type EventVerseRef,
	type StatsDimension
} from '$lib/db/events';
import { todayLocalKey } from '$lib/db/activity';
import { installPackage, listPackages, listVerses } from '$lib/db/verses';
import type { DifficultyLevel } from '$lib/db/verseRatings';
import type { StoredVerse } from '$lib/db/local';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface StatsVerseRow {
	verse: StoredVerse;
	packageId: string;
	packageName: string;
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

/** 'none' is the unrated remainder, and so is anything unparseable — a bad
 *  level in a hand-edited URL should land somewhere honest rather than throw. */
function parseLevel(raw: string | null): DifficultyLevel | null {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 5) return null;
	return n as DifficultyLevel;
}

export const load: PageLoad = async ({ url }): Promise<StatsVersesLoadData> => {
	const rawDim = url.searchParams.get('dim');
	const rawLevel = url.searchParams.get('level');
	const isPerfect = rawDim === 'perfect';
	const dim = isPerfect ? ('perfect' as const) : parseDim(rawDim);
	const level = isPerfect ? null : parseLevel(rawLevel);
	// Only an explicit yes asks for the flawless ones; anything else is the
	// remainder, which is the safer default for a hand-edited URL.
	const perfect = rawLevel === 'yes';
	const eventId = url.searchParams.get('event') ?? '';

	// Resolved through buildEventCards rather than the raw event so this page
	// sees exactly the ranges the chart was built from — same group visibility,
	// same dropped-because-uninstalled ranges. A list that disagreed with the
	// bar it was opened from would be worse than no list.
	const card = (await buildEventCards(todayLocalKey())).find((c) => c.eventId === eventId);
	if (!card) return { eventTitle: '', dim, level, perfect, rows: [] };

	const refs: EventVerseRef[] = isPerfect
		? await versesByPerfection(card.ranges, perfect)
		: await versesAtLevel(card.ranges, dim as StatsDimension, level);
	if (refs.length === 0) return { eventTitle: card.eventTitle, dim, level, perfect, rows: [] };

	const packageIds = Array.from(new Set(refs.map((r) => r.packageId)));
	await Promise.all(packageIds.map((id) => installPackage(id).catch(() => {})));

	const [packages, versesPerPackage] = await Promise.all([
		listPackages(),
		Promise.all(packageIds.map((id) => listVerses(id)))
	]);

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
			packageName: nameById.get(ref.packageId) ?? ref.packageId
		});
	}

	return { eventTitle: card.eventTitle, dim, level, perfect, rows };
};
