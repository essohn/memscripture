import type { VerseProgress } from '$lib/types';
import { shouldGraduate, advanceBucket, isRecheckDue, applyRecheckResult } from './buckets';

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

/**
 * Resolves a re-check that has just been reviewed.
 *
 * Returns the updated progress for the caller to persist, or null when the
 * verse was not a due re-check — the ordinary buckets are handled by
 * applyGraduations and must not be touched here.
 *
 * Skipping this would leave a passed verse holding its old enteredBucketAt,
 * so it would read as overdue again the next morning and return to the queue
 * every single day.
 */
export function settleRecheck(
	p: VerseProgress,
	score: number,
	now: number = Date.now()
): VerseProgress | null {
	if (!isRecheckDue(p, now)) return null;
	return applyRecheckResult(p, score, now);
}
