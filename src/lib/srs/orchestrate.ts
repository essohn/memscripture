import type { VerseProgress } from '$lib/types';
import { shouldGraduate, advanceBucket } from './buckets';

export interface GraduationResult {
	/** Cards whose bucket changed in this pass — caller must persist these. */
	graduated: VerseProgress[];
	/** Full progress list post-graduation. Use this for queue building. */
	current: VerseProgress[];
}

/**
 * Pure: scans progress, runs advanceBucket on each eligible card, and reports
 * both the changed cards (for persistence) and the full post-graduation snapshot
 * (for downstream queue building). Does not mutate input.
 */
export function applyGraduations(progress: VerseProgress[]): GraduationResult {
	const graduated: VerseProgress[] = [];
	const current: VerseProgress[] = [];
	for (const p of progress) {
		if (shouldGraduate(p)) {
			const next = advanceBucket(p);
			graduated.push(next);
			current.push(next);
		} else {
			current.push(p);
		}
	}
	return { graduated, current };
}
