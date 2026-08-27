import {
	buildEventCards,
	versesAtLevel,
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
	dim: StatsDimension;
	/** null is the 미평가 list. */
	level: DifficultyLevel | null;
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
	const dim = parseDim(url.searchParams.get('dim'));
	const level = parseLevel(url.searchParams.get('level'));
	const eventId = url.searchParams.get('event') ?? '';

	// Resolved through buildEventCards rather than the raw event so this page
	// sees exactly the ranges the chart was built from — same group visibility,
	// same dropped-because-uninstalled ranges. A list that disagreed with the
	// bar it was opened from would be worse than no list.
	const card = (await buildEventCards(todayLocalKey())).find((c) => c.eventId === eventId);
	if (!card) return { eventTitle: '', dim, level, rows: [] };

	const refs: EventVerseRef[] = await versesAtLevel(card.ranges, dim, level);
	if (refs.length === 0) return { eventTitle: card.eventTitle, dim, level, rows: [] };

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

	return { eventTitle: card.eventTitle, dim, level, rows };
};
