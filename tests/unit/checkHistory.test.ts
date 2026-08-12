import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import { HISTORY_LIMIT, listChecks, recordCheck } from '../../src/lib/db/checkHistory';

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
