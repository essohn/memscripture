import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getShowVerseTextInList,
	getSpeakOptions,
	setShowVerseTextInList,
	setSpeakOption
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
			speakRepeat: false
		});
	});

	// They share one settings row, so writing any one of them must merge rather
	// than replace — the same hazard the font scale and text toggle already have.
	it('round-trips a change without dropping the others', async () => {
		await setSpeakOption('speakRepeat', true);
		await setSpeakOption('speakRate', 0.6);
		const o = await getSpeakOptions();
		expect(o).toEqual({ speakTitle: false, speakRate: 0.6, speakRepeat: true });
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
});

