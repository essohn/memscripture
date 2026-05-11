import type { VerseProgress } from '$lib/types';

const ACTIVE_WINDOW_SIZE = 12;
const SCORING_WINDOW = 5;

export function priorityScore(p: VerseProgress): number {
	const cite = p.citeRatings.slice(-SCORING_WINDOW);
	const recall = p.recallRatings.slice(-SCORING_WINDOW);
	const recent = [...cite, ...recall];
	if (recent.length === 0) return 0;
	return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function selectOldActiveWindow(allOld: VerseProgress[]): VerseProgress[] {
	return [...allOld]
		.sort((a, b) => priorityScore(a) - priorityScore(b) || a.lastReviewedAt - b.lastReviewedAt)
		.slice(0, ACTIVE_WINDOW_SIZE);
}
