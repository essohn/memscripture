import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';
import { recommendNext } from './intake';

const NEW_SLOT_CAPACITY = 2;

export interface SuggestionEntry {
	packageId: string;
	verseNo: number;
}

/**
 * Returns 0–2 suggestions for filling empty New slots. Each suggestion is a
 * distinct unmemorized verse from packageVerses, ordered by verseNo ascending.
 *
 * Caller passes only this-package progress; this function does NOT filter by
 * packageId.
 */
export function buildSuggestions(
	progress: VerseProgress[],
	packageVerses: StoredVerse[]
): SuggestionEntry[] {
	if (packageVerses.length === 0) return [];
	const packageId = packageVerses[0].package_id;
	const activeNewCount = progress.filter((p) => p.bucket === 'new').length;
	const slotsToFill = Math.max(0, NEW_SLOT_CAPACITY - activeNewCount);
	if (slotsToFill === 0) return [];

	const out: SuggestionEntry[] = [];
	let extendedProgress = [...progress];
	for (let i = 0; i < slotsToFill; i++) {
		const next = recommendNext(packageVerses, extendedProgress);
		if (next === null) break;
		out.push({ packageId, verseNo: next });
		// Treat the just-recommended verse as if it were in New so the next
		// call skips it and picks a different verse.
		extendedProgress = [
			...extendedProgress,
			{
				id: `${packageId}:${next}`,
				packageId,
				verseNo: next,
				bucket: 'new',
				enteredBucketAt: 0,
				daysActiveInBucket: 0,
				lastReviewedAt: 0,
				citeRatings: [],
				recallRatings: []
			}
		];
	}
	return out;
}
