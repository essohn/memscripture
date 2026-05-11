import type { VerseProgress } from '$lib/types';
import type { StoredVerse } from '$lib/db/local';

/**
 * Picks the next unmemorized verse from a package, ordered by verseNo ascending.
 * Caller passes only this-package progress; this function does NOT filter by packageId.
 */
export function recommendNext(
	packageVerses: StoredVerse[],
	packageProgress: VerseProgress[]
): number | null {
	const memorizedNos = new Set(packageProgress.map((p) => p.verseNo));
	const candidates = packageVerses
		.filter((v) => !memorizedNos.has(v.no))
		.sort((a, b) => a.no - b.no);
	return candidates[0]?.no ?? null;
}
