import { db } from './local';
import { progressId } from './progress';
import type { Bookmark, BookmarkColor } from '$lib/types';
import { touchDataModified } from './touchData';

export async function getBookmark(
	packageId: string,
	verseNo: number
): Promise<Bookmark | undefined> {
	return db.bookmarks.get(progressId(packageId, verseNo));
}

/**
 * `createdAt` is injectable so a batch can share one stamp.
 *
 * The bookmarks list sorts by createdAt descending, and Array#sort is stable,
 * so equal stamps fall back to the order listAllBookmarks returned — verse
 * order. Letting each write call Date.now() instead made a batch land on one
 * or two adjacent milliseconds depending on timing, so it sometimes sorted as
 * one block and sometimes split and reversed. One deliberate stamp makes the
 * tie certain, and with it the ordering.
 */
export async function setBookmark(
	packageId: string,
	verseNo: number,
	color: BookmarkColor,
	createdAt: number = Date.now()
): Promise<void> {
	await db.bookmarks.put({
		id: progressId(packageId, verseNo),
		packageId,
		verseNo,
		color,
		createdAt
	});
	await touchDataModified();
}

export async function clearBookmark(packageId: string, verseNo: number): Promise<void> {
	const id = progressId(packageId, verseNo);
	const existing = await db.bookmarks.get(id);
	if (!existing) return;
	await db.bookmarks.delete(id);
	await touchDataModified();
}

export async function listBookmarksByColor(color: BookmarkColor): Promise<Bookmark[]> {
	return db.bookmarks.where('color').equals(color).reverse().sortBy('createdAt');
}

/**
 * All bookmarks, ordered by package then verse number.
 *
 * The sort is the point. `toArray()` yields IndexedDB primary-key order, and
 * the key is the string `${packageId}:${verseNo}` — so verse 10 sorts before
 * verse 2, and a bookmarked range comes out as 1, 10, 100, 127, 2, 20, 3.
 * Nothing downstream re-sorted, so that lexicographic accident was the order
 * the user saw.
 */
export async function listAllBookmarks(): Promise<Bookmark[]> {
	const rows = await db.bookmarks.toArray();
	return rows.sort(
		(a, b) => a.packageId.localeCompare(b.packageId) || a.verseNo - b.verseNo
	);
}

export async function clearAllOfColor(color: BookmarkColor): Promise<number> {
	const count = await db.bookmarks.where('color').equals(color).delete();
	if (count > 0) await touchDataModified();
	return count;
}

export async function countByColor(): Promise<Record<BookmarkColor, number>> {
	const all = await db.bookmarks.toArray();
	const counts = { red: 0, amber: 0, green: 0, blue: 0, purple: 0 } as Record<BookmarkColor, number>;
	for (const b of all) counts[b.color] += 1;
	return counts;
}
