import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	DIFFICULTY_LEVELS,
	DIFFICULTY_LABELS,
	DIFFICULTY_COLORS,
	getVerseRating,
	setStartDifficulty,
	setFullDifficulty
} from '../../src/lib/db/verseRatings';
import { eventStats, versesAtLevel, isMemorized, type RangeCardVM } from '../../src/lib/db/events';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

const range = (verseNos: number[], packageId = '5_krv'): RangeCardVM => ({
	label: 'r', done: 0, total: verseNos.length, href: '', packageId, verseNos
});

describe('difficulty level 0', () => {
	it('sits at the hard end of the scale', () => {
		expect(DIFFICULTY_LEVELS).toEqual([0, 1, 2, 3, 4, 5]);
		expect(DIFFICULTY_LABELS[0]).toBe('Impossible');
	});

	it('is black, the only level that is', () => {
		expect(DIFFICULTY_COLORS[0]).toContain('black');
	});

	it('can be stored and read back', async () => {
		await setStartDifficulty('5_krv', 1, 0);
		expect((await getVerseRating('5_krv', 1))?.startDifficulty).toBe(0);
	});

	// 0 means the verse is brutally hard, not that it was never judged. The
	// reader worked through it either way.
	it('still counts as memorized', async () => {
		await setStartDifficulty('5_krv', 1, 0);
		await setFullDifficulty('5_krv', 1, 0);
		expect(isMemorized(await getVerseRating('5_krv', 1) ?? undefined)).toBe(true);
	});

	it('gets its own slot in the histogram', async () => {
		await setStartDifficulty('5_krv', 1, 0);
		await setStartDifficulty('5_krv', 2, 5);

		const stats = await eventStats([range([1, 2])]);
		expect(stats.start).toEqual([1, 0, 0, 0, 0, 1]);
	});

	it('is not counted as unrated', async () => {
		await setStartDifficulty('5_krv', 1, 0);

		const stats = await eventStats([range([1, 2])]);
		expect(stats.total - stats.start.reduce((a, b) => a + b, 0)).toBe(1);
	});

	it('opens its own verse list', async () => {
		await setStartDifficulty('5_krv', 1, 0);
		await setStartDifficulty('5_krv', 2, 1);

		expect(await versesAtLevel([range([1, 2])], 'start', 0)).toEqual([
			{ packageId: '5_krv', verseNo: 1 }
		]);
	});

	// -1 is not a level; it should be refused like any other out-of-scale value
	// rather than land in a slot.
	it('refuses a value below the scale', async () => {
		await setStartDifficulty('5_krv', 1, -1 as never);
		expect((await getVerseRating('5_krv', 1))?.startDifficulty ?? null).toBeNull();
	});
});
