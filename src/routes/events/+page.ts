import { buildAllEventCards, dDay, type EventCardVM } from '$lib/db/events';
import { todayLocalKey } from '$lib/db/activity';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface EventsLoadData {
	/** Still running: today is on or before the deadline. */
	current: EventCardVM[];
	/** Finished. Newest deadline first, which is the order a list of what is
	 *  done is read in. */
	past: EventCardVM[];
}

export const load: PageLoad = async (): Promise<EventsLoadData> => {
	const today = todayLocalKey();
	const cards = await buildAllEventCards(today).catch(() => []);
	// Split on the same rule the home screen filters by, so a DAY is never
	// current here and gone there.
	const current = cards.filter((c) => dDay(c.dueAt, today) >= 0);
	const past = cards.filter((c) => dDay(c.dueAt, today) < 0);
	// buildAllEventCards sorts newest-first, which is right for the archive and
	// backwards for what is coming.
	return { current: [...current].reverse(), past };
};
