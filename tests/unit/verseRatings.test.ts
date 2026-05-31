import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getVerseRating,
	setFullDifficulty,
	setStartDifficulty
} from '../../src/lib/db/verseRatings';
import { getDataLastModified } from '../../src/lib/db/touchData';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('verseRatings', () => {
	it('returns null when no rating exists', async () => {
		expect(await getVerseRating('5_krv', 1)).toBeNull();
	});

	it('setStartDifficulty creates a row with the level and null fullDifficulty', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		const row = await getVerseRating('5_krv', 1);
		expect(row?.startDifficulty).toBe(2);
		expect(row?.fullDifficulty).toBeNull();
		expect(typeof row?.updatedAt).toBe('number');
	});

	it('setFullDifficulty merges with an existing startDifficulty row', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 4);
		const row = await getVerseRating('5_krv', 1);
		expect(row?.startDifficulty).toBe(2);
		expect(row?.fullDifficulty).toBe(4);
	});

	it('setting to null clears that field but preserves the other', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setFullDifficulty('5_krv', 1, 4);
		await setStartDifficulty('5_krv', 1, null);
		const row = await getVerseRating('5_krv', 1);
		expect(row?.startDifficulty).toBeNull();
		expect(row?.fullDifficulty).toBe(4);
	});

	it('rejects out-of-range levels silently (no row written)', async () => {
		await setStartDifficulty('5_krv', 1, 7 as 1);
		expect(await getVerseRating('5_krv', 1)).toBeNull();
		await setStartDifficulty('5_krv', 1, 0 as 1);
		expect(await getVerseRating('5_krv', 1)).toBeNull();
	});

	it('mutations bump data_last_modified_at', async () => {
		expect(await getDataLastModified()).toBeNull();
		await setStartDifficulty('5_krv', 1, 3);
		const stamp = await getDataLastModified();
		expect(typeof stamp).toBe('string');
		expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('updatedAt advances on each write', async () => {
		await setStartDifficulty('5_krv', 1, 3);
		const a = (await getVerseRating('5_krv', 1))!.updatedAt;
		await new Promise((r) => setTimeout(r, 5));
		await setFullDifficulty('5_krv', 1, 4);
		const b = (await getVerseRating('5_krv', 1))!.updatedAt;
		expect(b).toBeGreaterThan(a);
	});

	it('two verses do not share a row', async () => {
		await setStartDifficulty('5_krv', 1, 2);
		await setStartDifficulty('5_krv', 2, 4);
		const r1 = await getVerseRating('5_krv', 1);
		const r2 = await getVerseRating('5_krv', 2);
		expect(r1?.startDifficulty).toBe(2);
		expect(r2?.startDifficulty).toBe(4);
	});
});
