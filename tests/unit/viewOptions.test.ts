import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import { getShowVerseTextInList, setShowVerseTextInList } from '../../src/lib/db/viewOptions';

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
});
