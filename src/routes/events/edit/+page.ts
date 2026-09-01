import { listPackages, isPackageInstalled, listVerses } from '$lib/db/verses';
import { listUserEvents, isUserEventId } from '$lib/db/userEvents';
import { emptyDraft, eventToDraft, type EventDraft } from '$lib/events/form';
import { todayLocalKey } from '$lib/db/activity';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface PackageChoice {
	id: string;
	name: string;
	/** The highest verse number it has, so the form can say what the range may
	 *  reach rather than letting the reader aim past the end of a package. */
	maxVerseNo: number;
}

export interface EventEditLoadData {
	draft: EventDraft;
	packages: PackageChoice[];
	/** True when this is a DAY the reader made, and so one they may change. The
	 *  published ones belong to whoever publishes the app. */
	editable: boolean;
	/** Editing an existing one rather than making a new one. */
	existing: boolean;
}

export const load: PageLoad = async ({ url }): Promise<EventEditLoadData> => {
	const packages: PackageChoice[] = [];
	for (const p of await listPackages().catch(() => [])) {
		if (!(await isPackageInstalled(p.id))) continue;
		const verses = await listVerses(p.id).catch(() => []);
		if (verses.length === 0) continue;
		packages.push({
			id: p.id,
			name: p.name,
			maxVerseNo: verses.reduce((max, v) => Math.max(max, v.no), 0)
		});
	}

	const id = url.searchParams.get('id');
	if (!id) {
		return {
			draft: emptyDraft(packages[0]?.id ?? '', todayLocalKey()),
			packages,
			editable: true,
			existing: false
		};
	}

	const found = (await listUserEvents().catch(() => [])).find((e) => e.id === id);
	return {
		draft: found ? eventToDraft(found) : emptyDraft(packages[0]?.id ?? '', todayLocalKey()),
		packages,
		// A published DAY has no row here, and is not the reader's to change.
		editable: isUserEventId(id) && Boolean(found),
		existing: Boolean(found)
	};
};
