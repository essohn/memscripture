import { redirect } from '@sveltejs/kit';
import { getActivePackageId } from '$lib/db/activePackage';
import { listProgressByPackage, upsertProgress } from '$lib/db/progress';
import { listVerses } from '$lib/db/verses';
import { getActivityHistory, markActiveToday } from '$lib/db/activity';
import { applyGraduations } from '$lib/srs/orchestrate';
import { buildTodayQueue } from '$lib/srs/scheduler';
import { buildSuggestions, type SuggestionEntry } from '$lib/srs/suggestions';
import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = false;

export interface TodayLoadData {
	activeId: string;
	queue: VerseProgress[];
	suggestions: SuggestionEntry[];
	packageVerses: StoredVerse[];
}

export const load: PageLoad = async (): Promise<TodayLoadData> => {
	const activeId = await getActivePackageId();
	if (!activeId) {
		throw redirect(307, '/');
	}

	const [rawProgress, packageVerses, activity] = await Promise.all([
		listProgressByPackage(activeId),
		listVerses(activeId),
		getActivityHistory()
	]);

	// 1. Apply pending graduations + persist them.
	const { graduated, current } = applyGraduations(rawProgress);
	for (const g of graduated) {
		await upsertProgress(g);
	}

	// 2. Stamp today as an active day (side effect).
	await markActiveToday();

	// 3. Compose queue + suggestions.
	const queue = buildTodayQueue(current, activity);
	const suggestions = buildSuggestions(current, packageVerses);

	return { activeId, queue, suggestions, packageVerses };
};
