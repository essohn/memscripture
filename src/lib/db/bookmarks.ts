import { db } from './local';
import { progressId } from './progress';
import type { Bookmark, BookmarkColor } from '$lib/types';

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
}

export async function clearBookmark(packageId: string, verseNo: number): Promise<void> {
	await db.bookmarks.delete(progressId(packageId, verseNo));
}

export async function listBookmarksByColor(color: BookmarkColor): Promise<Bookmark[]> {
	return db.bookmarks.where('color').equals(color).reverse().sortBy('createdAt');
}

export async function listAllBookmarks(): Promise<Bookmark[]> {
	return db.bookmarks.toArray();
}

export async function clearAllOfColor(color: BookmarkColor): Promise<number> {
	return db.bookmarks.where('color').equals(color).delete();
}

export async function countByColor(): Promise<Record<BookmarkColor, number>> {
	const all = await db.bookmarks.toArray();
	const counts = { red: 0, amber: 0, green: 0, blue: 0, purple: 0 } as Record<BookmarkColor, number>;
	for (const b of all) counts[b.color] += 1;
	return counts;
}
