import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getShowVerseTextInList,
	getSpeakOptions,
	setShowVerseTextInList,
	setSpeakOption,
	getVerseFontScale
} from '../../src/lib/db/viewOptions';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('viewOptions', () => {
	it('returns default true when no record exists', async () => {
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('round-trips false', async () => {
		await setShowVerseTextInList(false);
		expect(await getShowVerseTextInList()).toBe(false);
	});

	it('round-trips back to true', async () => {
		await setShowVerseTextInList(false);
		await setShowVerseTextInList(true);
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('returns default when stored value is not a boolean', async () => {
		await db.settings.put({ key: 'view_options', value: { showVerseTextInList: 'yes' } });
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('returns default when stored row is malformed (not an object)', async () => {
		await db.settings.put({ key: 'view_options', value: 'broken' });
		expect(await getShowVerseTextInList()).toBe(true);
	});

	it('preserves unrelated keys when writing', async () => {
		await db.settings.put({
			key: 'view_options',
			value: { showVerseTextInList: true, futureFlag: 42 }
		});
		await setShowVerseTextInList(false);
		const entry = await db.settings.get('view_options');
		expect(entry?.value).toEqual({ showVerseTextInList: false, futureFlag: 42 });
	});

	it('serializes overlapping writes (last call wins)', async () => {
		const a = setShowVerseTextInList(false);
		const b = setShowVerseTextInList(true);
		await Promise.all([a, b]);
		expect(await getShowVerseTextInList()).toBe(true);
	});
});

describe('읽어주기 options', () => {
	it('defaults to no title, slightly slow, no repeat', async () => {
		expect(await getSpeakOptions()).toEqual({
			speakTitle: false,
			speakRate: 0.9,
			speakRepeat: false,
			speakListRepeat: true,
			speakVoice: '',
			speakGender: 'auto',
			reciteScale: 1
		});
	});

	// They share one settings row, so writing any one of them must merge rather
	// than replace — the same hazard the font scale and text toggle already have.
	it('round-trips a change without dropping the others', async () => {
		await setSpeakOption('speakRepeat', true);
		await setSpeakOption('speakRate', 0.6);
		const o = await getSpeakOptions();
		expect(o).toEqual({
			speakTitle: false,
			speakRate: 0.6,
			speakRepeat: true,
			speakListRepeat: true,
			speakVoice: '',
			speakGender: 'auto',
			reciteScale: 1
		});
	});

	it('leaves the unrelated view options alone', async () => {
		await setShowVerseTextInList(false);
		await setSpeakOption('speakTitle', true);
		expect(await getShowVerseTextInList()).toBe(false);
		expect((await getSpeakOptions()).speakTitle).toBe(true);
	});

	// A rate from a renamed picker or a hand-edited row must not reach the
	// synthesizer, which would read at a nonsense speed or throw.
	it('snaps an unknown rate back to the default', async () => {
		await db.settings.put({ key: 'view_options', value: { speakRate: 9 } });
		expect((await getSpeakOptions()).speakRate).toBe(0.9);
	});

	// Separate from speakRepeat on purpose. That one means "loop this one
	// verse forever" on a card; a reader who wants a list to come round again
	// does not want every card to loop.
	it('speakListRepeat defaults to true', async () => {
		expect((await getSpeakOptions()).speakListRepeat).toBe(true);
	});

	it('round-trips speakListRepeat false', async () => {
		await setSpeakOption('speakListRepeat', false);
		expect((await getSpeakOptions()).speakListRepeat).toBe(false);
	});

	it('falls back to the default when speakListRepeat is not a boolean', async () => {
		await db.settings.put({ key: 'view_options', value: { speakListRepeat: 'yes' } });
		expect((await getSpeakOptions()).speakListRepeat).toBe(true);
	});

	it('leaves speakRepeat alone when speakListRepeat is written', async () => {
		await setSpeakOption('speakRepeat', true);
		await setSpeakOption('speakListRepeat', false);
		const opts = await getSpeakOptions();
		expect(opts.speakRepeat).toBe(true);
		expect(opts.speakListRepeat).toBe(false);
	});
});



describe('retired keys', () => {
	// The 통계 보기 toggle is gone, but installs that used it still carry its
	// map inside this row — and the row is part of the sync envelope, so it
	// would travel between devices forever. Dropped on the next write rather
	// than by a migration pass of its own: nothing reads it in the meantime.
	it('drops eventStatsOpen the next time the row is written', async () => {
		await db.settings.put({
			key: 'view_options',
			value: { showVerseTextInList: true, eventStatsOpen: { e1: true } }
		});

		await setShowVerseTextInList(false);

		const row = await db.settings.get('view_options');
		expect(row?.value).not.toHaveProperty('eventStatsOpen');
	});

	it('keeps the options that are still in use', async () => {
		await db.settings.put({
			key: 'view_options',
			value: { verseFontScale: 1.3, eventStatsOpen: { e1: true } }
		});

		await setShowVerseTextInList(false);

		expect(await getVerseFontScale()).toBe(1.3);
		expect(await getShowVerseTextInList()).toBe(false);
	});
});

describe('reciteScale', () => {
	// 따라 읽기's silence is the verse's estimated reading time, and this is the
	// dial on top of it: half for someone who knows the set cold, half again
	// for someone still finding the words.
	it('defaults to leaving the estimate as it is', async () => {
		expect((await getSpeakOptions()).reciteScale).toBe(1);
	});

	it('remembers a chosen scale', async () => {
		await setSpeakOption('reciteScale', 0.5);
		expect((await getSpeakOptions()).reciteScale).toBe(0.5);
	});

	// Same guard as speakRate: a value from an older build, a hand-edited
	// record or a future one that offered another step must not reach the
	// player as a multiplier nobody chose.
	it('falls back when the stored value is not one of the steps', async () => {
		await db.settings.put({ key: 'view_options', value: { reciteScale: 2.7 } });
		expect((await getSpeakOptions()).reciteScale).toBe(1);
	});
});
