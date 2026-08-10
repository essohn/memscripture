import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getBookmark,
	setBookmark,
	clearBookmark,
	listAllBookmarks,
	listBookmarksByColor,
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

	// End-to-end for the reported bug: a batch written with one shared stamp
	// must reach the screen in verse order. The page sorts createdAt descending
	// and Array#sort is stable, so an equal stamp defers to listAllBookmarks'
	// ordering — which is the whole reason that ordering had to be verse-based.
	it('a batch sharing one timestamp lists in verse order', async () => {
		const addedAt = Date.now();
		// Written in the order the user happened to tap them.
		for (const no of [20, 3, 127, 1, 100]) {
			await setBookmark('900_krv', no, 'green', addedAt);
		}
		const rows = await listAllBookmarks();
		const displayed = [...rows].sort((a, b) => b.createdAt - a.createdAt);
		expect(displayed.map((r) => r.verseNo)).toEqual([1, 3, 20, 100, 127]);
	});

	it('keeps a later batch above an earlier one', async () => {
		const first = Date.now();
		await setBookmark('900_krv', 50, 'green', first);
		await setBookmark('900_krv', 51, 'green', first);
		await setBookmark('900_krv', 2, 'green', first + 1000);
		await setBookmark('900_krv', 1, 'green', first + 1000);
		const displayed = [...(await listAllBookmarks())].sort((a, b) => b.createdAt - a.createdAt);
		expect(displayed.map((r) => r.verseNo)).toEqual([1, 2, 50, 51]);
	});

	// The store's primary key is the string `${packageId}:${verseNo}`, so
	// toArray() yields 1, 10, 100, 127, 2, 20, 3 — the order that reached the
	// bookmarks page before this sorted. Verse numbers spanning digit counts are
	// the only ones that expose it.
	it('listAllBookmarks orders by verse number, not by key string', async () => {
		for (const no of [3, 100, 1, 20, 127, 2, 10]) {
			await setBookmark('900_krv', no, 'green');
		}
		const rows = await listAllBookmarks();
		expect(rows.map((r) => r.verseNo)).toEqual([1, 2, 3, 10, 20, 100, 127]);
	});

	it('listAllBookmarks groups packages together', async () => {
		await setBookmark('900_krv', 2, 'green');
		await setBookmark('242_krv', 10, 'green');
		await setBookmark('900_krv', 1, 'green');
		await setBookmark('242_krv', 3, 'green');
		const rows = await listAllBookmarks();
		expect(rows.map((r) => `${r.packageId}:${r.verseNo}`)).toEqual([
			'242_krv:3',
			'242_krv:10',
			'900_krv:1',
			'900_krv:2'
		]);
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
