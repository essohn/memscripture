import { deleteOyoVerse } from '$lib/db/oyo';

/**
 * Takes back the verses an import just wrote.
 *
 * Both import doors offer this on the screen that says what they did, and only
 * there. A durable "undo yesterday's import" sounds better and would be worse:
 * it would need every verse to record which import it came from, and
 * `sync/merge.ts` deliberately keeps no tombstones — it cannot tell "deleted
 * here" from "never seen here", so a second device would hand the deleted
 * verses straight back. Undoing inside the minute the reader is still looking
 * at the confirmation is a promise this app can actually keep.
 *
 * There is no undo of the undo. The reader is on a screen naming what they
 * just did, tapping a labelled button behind a confirmation; a second layer
 * would be ceremony, not safety.
 */

export interface UndoResult {
	/** How many verses actually went. */
	removed: number;
	/** How many the import had written. */
	total: number;
}

/**
 * Deletes in ascending order and counts what actually went.
 *
 * A delete that throws partway stops the run and reports the truth rather than
 * the intention: the verses that went are gone, the rest are still in 나의
 * 구절, and the caller has both numbers to say so. Swallowing the error and
 * claiming a clean undo would leave the reader believing verses were removed
 * that are still sitting there.
 */
export async function undoImport(verseNos: readonly number[]): Promise<UndoResult> {
	const total = verseNos.length;
	let removed = 0;
	try {
		for (const no of [...verseNos].sort((a, b) => a - b)) {
			await deleteOyoVerse(no);
			removed++;
		}
	} catch {
		// The counts are the report; there is nothing to add to them here.
	}
	return { removed, total };
}
