import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	DIFFICULTY_LABELS,
	DIFFICULTY_LEVELS,
	DIFFICULTY_SHORT,
	getVerseRating,
	setFullDifficulty,
	setStartDifficulty
} from '../../src/lib/db/verseRatings';
import { getDataLastModified } from '../../src/lib/db/touchData';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

// The home chart gives each of the six levels about 24px, and 'Impossible'
// needs closer to 42px at the size it is drawn. The short labels exist so the
// axis can name the level in words rather than in a number the reader has to
// look up — and so nobody reaches for a fresh abbreviation at the call site.
describe('DIFFICULTY_SHORT', () => {
	it('carries a label for every level', () => {
		for (const level of DIFFICULTY_LEVELS) {
			expect(DIFFICULTY_SHORT[level]).toBeTruthy();
		}
	});

	// Five characters is what fits. Longer and the axis labels collide with
	// their neighbours, which is the failure the numbers were replacing.
	it('keeps every label inside five characters', () => {
		for (const level of DIFFICULTY_LEVELS) {
			expect(DIFFICULTY_SHORT[level].length).toBeLessThanOrEqual(5);
		}
	});

	// A truncation, never a synonym: a reader who meets 'Imp' on the chart and
	// 'Impossible' in the picker has to recognise them as one word.
	it('truncates the full label rather than renaming it', () => {
		for (const level of DIFFICULTY_LEVELS) {
			expect(DIFFICULTY_LABELS[level].startsWith(DIFFICULTY_SHORT[level])).toBe(true);
		}
	});
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

	// 0 joined the scale as Impossible, so the values outside it are now 6 and
	// up, and anything below zero.
	it('rejects out-of-range levels silently (no row written)', async () => {
		await setStartDifficulty('5_krv', 1, 7 as 1);
		expect(await getVerseRating('5_krv', 1)).toBeNull();
		await setStartDifficulty('5_krv', 1, -1 as 1);
		expect(await getVerseRating('5_krv', 1)).toBeNull();
	});

	it('accepts 0 as the hardest level', async () => {
		await setStartDifficulty('5_krv', 1, 0);
		expect((await getVerseRating('5_krv', 1))?.startDifficulty).toBe(0);
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

	// VerseCard fires these back to back, unawaited (onPickStartDifficulty then
	// onPickFullDifficulty). Both are read-modify-write, so without
	// serialization the second read misses the first write and its put clobbers
	// startDifficulty back to null.
	it('two concurrent writes to the same verse do not lose either field', async () => {
		const p1 = setStartDifficulty('5_krv', 1, 4);
		const p2 = setFullDifficulty('5_krv', 1, 3);
		await Promise.all([p1, p2]);
		const row = await getVerseRating('5_krv', 1);
		expect(row?.startDifficulty).toBe(4);
		expect(row?.fullDifficulty).toBe(3);
	});
});
