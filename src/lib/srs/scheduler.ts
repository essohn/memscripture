import type { VerseProgress, DailyActivity } from '$lib/types';
import { selectOldActiveWindow } from './oldWindow';
import { isRecheckDue } from './buckets';

const CURRENT_ROTATION_BUCKETS = 3;
const OLD_PER_DAY = 2;
/**
 * Re-checks admitted per day. Verses memorized together graduate together, so
 * 90 days later a whole batch comes due at once; without a cap the queue would
 * spike from nothing to dozens on a single morning.
 */
const RECHECK_PER_DAY = 2;

/**
 * Stable hash of a verse id. Returns the same number for the same id every time.
 * Used to assign each Current card to a deterministic 0/1/2 rotation slot.
 */
function rotationSlot(verseId: string): number {
	let hash = 0;
	for (let i = 0; i < verseId.length; i++) {
		hash = (hash * 31 + verseId.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % CURRENT_ROTATION_BUCKETS;
}

/**
 * Composes today's review queue from already-graduated progress.
 * Activity history length is the day index; the caller is responsible for
 * having marked today active (or not) before calling this.
 *
 * Auto-graduation is NOT done here — call applyGraduations (Phase 3.2)
 * before passing progress in.
 */
export function buildTodayQueue(
	progress: VerseProgress[],
	activityHistory: DailyActivity[],
	now: number = Date.now()
): VerseProgress[] {
	const dayIndex = activityHistory.length;

	const news = progress.filter((p) => p.bucket === 'new');

	const currents = progress
		.filter((p) => p.bucket === 'current')
		.filter((p) => rotationSlot(p.id) === dayIndex % CURRENT_ROTATION_BUCKETS);

	const oldWindow = selectOldActiveWindow(progress.filter((p) => p.bucket === 'old'));
	const olds: VerseProgress[] = [];
	if (oldWindow.length > 0) {
		const start = (dayIndex * OLD_PER_DAY) % oldWindow.length;
		for (let i = 0; i < OLD_PER_DAY; i++) {
			olds.push(oldWindow[(start + i) % oldWindow.length]);
		}
		// dedupe (small windows can produce same id twice)
		const seen = new Set<string>();
		const uniqueOlds = olds.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
		olds.length = 0;
		olds.push(...uniqueOlds);
	}

	// Mastered verses are otherwise excluded; only those past their rest period
	// come back, longest-overdue first so nothing waits indefinitely behind a
	// steadier stream of newer graduates.
	const rechecks = progress
		.filter((p) => isRecheckDue(p, now))
		.sort((a, b) => a.enteredBucketAt - b.enteredBucketAt)
		.slice(0, RECHECK_PER_DAY);

	return [...news, ...currents, ...olds, ...rechecks];
}
