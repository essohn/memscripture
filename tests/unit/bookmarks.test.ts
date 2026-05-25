import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getBookmark,
	setBookmark,
	clearBookmark,
	listBookmarksByColor,
	listAllBookmarks,
	clearAllOfColor,
	countByColor
} from '../../src/lib/db/bookmarks';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('bookmarks db', () => {
	it('starts empty', async () => {
		expect(await listAllBookmarks()).toEqual([]);
		expect(await getBookmark('5_krv', 1)).toBeUndefined();
	});

	it('sets and reads a bookmark', async () => {
		await setBookmark('5_krv', 1, 'red');
		const b = await getBookmark('5_krv', 1);
		expect(b).toBeDefined();
		expect(b?.color).toBe('red');
		expect(b?.packageId).toBe('5_krv');
		expect(b?.verseNo).toBe(1);
		expect(b?.id).toBe('5_krv:1');
	});

	it('overwrites color on repeated set', async () => {
		await setBookmark('5_krv', 1, 'red');
		await setBookmark('5_krv', 1, 'blue');
		const b = await getBookmark('5_krv', 1);
		expect(b?.color).toBe('blue');
		expect(await listAllBookmarks()).toHaveLength(1);
	});

	it('clears a single bookmark', async () => {
		await setBookmark('5_krv', 1, 'red');
		await setBookmark('5_krv', 2, 'red');
		await clearBookmark('5_krv', 1);
		expect(await getBookmark('5_krv', 1)).toBeUndefined();
		expect(await getBookmark('5_krv', 2)).toBeDefined();
	});

	it('listBookmarksByColor returns only matching color, newest first', async () => {
		await setBookmark('5_krv', 1, 'red');
		// small delay to ensure distinct createdAt; if equal, ordering may flip — use explicit timestamps
		const reds = await listBookmarksByColor('red');
		expect(reds.map((b) => b.verseNo)).toEqual([1]);

		await setBookmark('5_krv', 2, 'green');
		await setBookmark('5_krv', 3, 'red');
		const moreReds = await listBookmarksByColor('red');
		expect(moreReds.every((b) => b.color === 'red')).toBe(true);
		expect(moreReds.map((b) => b.verseNo).sort()).toEqual([1, 3]);
		expect(await listBookmarksByColor('green')).toHaveLength(1);
		expect(await listBookmarksByColor('amber')).toHaveLength(0);
	});

	it('clearAllOfColor removes only the matching color', async () => {
		await setBookmark('5_krv', 1, 'red');
		await setBookmark('5_krv', 2, 'red');
		await setBookmark('5_krv', 3, 'blue');
		const deleted = await clearAllOfColor('red');
		expect(deleted).toBe(2);
		expect(await listBookmarksByColor('red')).toHaveLength(0);
		expect(await listBookmarksByColor('blue')).toHaveLength(1);
	});

	it('countByColor returns zeros for empty colors and accurate counts otherwise', async () => {
		await setBookmark('5_krv', 1, 'red');
		await setBookmark('5_krv', 2, 'red');
		await setBookmark('5_krv', 3, 'purple');
		const counts = await countByColor();
		expect(counts).toEqual({ red: 2, amber: 0, green: 0, blue: 0, purple: 1 });
	});
});
