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

export async function setBookmark(
	packageId: string,
	verseNo: number,
	color: BookmarkColor
): Promise<void> {
	await db.bookmarks.put({
		id: progressId(packageId, verseNo),
		packageId,
		verseNo,
		color,
		createdAt: Date.now()
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

export async function listAllBookmarks(): Promise<Bookmark[]> {
	return db.bookmarks.toArray();
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
