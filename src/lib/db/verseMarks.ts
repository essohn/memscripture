import { db, type VerseMark } from './local';
import { toggleMark, type StoredMark } from '$lib/memorize/marks';
import { touchDataModified } from './touchData';

function rowId(packageId: string, verseNo: number): string {
	return `${packageId}:${verseNo}`;
}

/**
 * Serializes writes.
 *
 * Toggling is read-modify-write, and two taps in quick succession would
 * otherwise both read the pre-write row and the second would erase the first.
 * This is the same failure that dropped a difficulty rating once already —
 * two unawaited upserts, the second writing back a stale null — so the queue
 * from verseRatings is repeated here rather than relearned.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
	const next = writeQueue.then(work, work);
	writeQueue = next.catch(() => {});
	return next;
}

/** Every marked verse in a package, keyed by verse number. One read per
 *  package rather than one per card — a 900-verse list would otherwise issue
 *  900 queries for underlines most verses do not have. */
export async function listMarksForPackage(packageId: string): Promise<Map<number, StoredMark[]>> {
	const rows = await db.verseMarks.where('packageId').equals(packageId).toArray();
	const out = new Map<number, StoredMark[]>();
	for (const r of rows) if (r.words.length > 0) out.set(r.verseNo, r.words);
	return out;
}

export async function getMarks(packageId: string, verseNo: number): Promise<StoredMark[]> {
	const row = await db.verseMarks.get(rowId(packageId, verseNo));
	return row?.words ?? [];
}

/**
 * Toggles one word's underline and returns the resulting set.
 *
 * A verse whose last mark is removed deletes its row rather than keeping an
 * empty one, so the table stays proportional to what the reader actually
 * marked and the sync snapshot does not carry 900 empty rows.
 */
export async function toggleVerseMark(
	packageId: string,
	verseNo: number,
	index: number,
	word: string
): Promise<StoredMark[]> {
	return serialize(async () => {
		const id = rowId(packageId, verseNo);
		const current = (await db.verseMarks.get(id))?.words ?? [];
		const next = toggleMark(current, index, word);
		if (next.length === 0) {
			await db.verseMarks.delete(id);
		} else {
			const row: VerseMark = {
				id,
				packageId,
				verseNo,
				words: next,
				updatedAt: Date.now()
			};
			await db.verseMarks.put(row);
		}
		await touchDataModified();
		return next;
	});
}
