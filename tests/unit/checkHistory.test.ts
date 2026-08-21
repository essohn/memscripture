import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	HISTORY_LIMIT,
	listChecks,
	listPerfectVerseNos,
	recordCheck
} from '../../src/lib/db/checkHistory';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

const entry = (over = {}) => ({ start: 4, full: 5, accuracy: 1, elapsedMs: 30_000, ...over }) as never;

describe('checkHistory', () => {
	it('records a check and reads it back', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		const rows = await listChecks('900_krv', 1);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ verseNo: 1, start: 4, full: 5, checkedAt: 1000 });
	});

	it('lists newest first', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		await recordCheck('900_krv', 1, entry(), 3000);
		await recordCheck('900_krv', 1, entry(), 2000);
		expect((await listChecks('900_krv', 1)).map((r) => r.checkedAt)).toEqual([3000, 2000, 1000]);
	});

	// A glance at recent form, not an audit trail — 900 verses times an
	// unbounded log would ride along in every sync snapshot.
	it('keeps only the most recent entries', async () => {
		for (let i = 1; i <= HISTORY_LIMIT + 5; i++) await recordCheck('900_krv', 1, entry(), i * 1000);
		const rows = await listChecks('900_krv', 1);
		expect(rows).toHaveLength(HISTORY_LIMIT);
		expect(rows[rows.length - 1].checkedAt).toBe(6000);
	});

	it('keeps verses and packages apart', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		await recordCheck('900_krv', 2, entry(), 1000);
		await recordCheck('242_krv', 1, entry(), 1000);
		expect(await listChecks('900_krv', 1)).toHaveLength(1);
		expect(await listChecks('242_krv', 1)).toHaveLength(1);
	});

	// Same verse, same millisecond: the id must still be unique or the second
	// check would silently overwrite the first.
	it('survives two checks in the same millisecond', async () => {
		await recordCheck('900_krv', 1, entry(), 1000);
		await recordCheck('900_krv', 1, entry({ full: 2 }), 1000);
		expect(await listChecks('900_krv', 1)).toHaveLength(2);
	});

	it('returns nothing for a verse never checked', async () => {
		expect(await listChecks('900_krv', 99)).toEqual([]);
	});
});

describe('listPerfectVerseNos', () => {
	it('lists the verses recited flawlessly', async () => {
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 });
		await recordCheck('900_krv', 2, { start: 2, full: 2, accuracy: 0.8, elapsedMs: 9000 });
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([1]);
	});

	// The most recent check decides, not the best one ever recorded. The badge
	// says the verse is solid now; one recited perfectly last month and fumbled
	// this morning is not, and keeping the popper on it would be the card
	// contradicting what the reader just did.
	it('drops a verse whose latest check was flawed', async () => {
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 }, 1000);
		await recordCheck('900_krv', 1, { start: 2, full: 2, accuracy: 0.6, elapsedMs: 9000 }, 2000);
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([]);
	});

	it('earns it back when the next check is flawless again', async () => {
		await recordCheck('900_krv', 1, { start: 2, full: 2, accuracy: 0.6, elapsedMs: 9000 }, 1000);
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 }, 2000);
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([1]);
	});

	// Rows come back in index order, not chronological order, so "latest" has
	// to be decided by checkedAt rather than by whichever arrived last.
	it('uses the newest check even when it was recorded out of order', async () => {
		await recordCheck('900_krv', 1, { start: 5, full: 5, accuracy: 1, elapsedMs: 9000 }, 5000);
		await recordCheck('900_krv', 1, { start: 2, full: 2, accuracy: 0.6, elapsedMs: 9000 }, 1000);
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([1]);
	});

	// The verseKey index is prefixed by the package id, so a scan must not
	// spill across packages.
	it('does not leak across packages', async () => {
		await recordCheck('900_krv', 7, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 });
		await recordCheck('100_krv', 9, { start: 5, full: 5, accuracy: 1, elapsedMs: 1000 });
		expect([...(await listPerfectVerseNos('900_krv'))]).toEqual([7]);
		expect([...(await listPerfectVerseNos('100_krv'))]).toEqual([9]);
	});

	it('is empty for a package with no checks', async () => {
		expect((await listPerfectVerseNos('5_krv')).size).toBe(0);
	});
});
