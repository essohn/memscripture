import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getEventSheetId,
	parseRegistry,
	registryKey,
	setEventSheetId
} from '../../src/lib/export/sheetRegistry';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('registryKey', () => {
	// drive.file reaches only files the app made for *that* account, so a
	// document created from one login is a 404 to another. Keying by event
	// alone would make two accounts overwrite each other's entry forever.
	it('separates the same event under different accounts', () => {
		expect(registryKey('a@x.com', 'summer')).not.toBe(registryKey('b@x.com', 'summer'));
	});

	it('separates different events under one account', () => {
		expect(registryKey('a@x.com', 'summer')).not.toBe(registryKey('a@x.com', 'winter'));
	});
});

describe('parseRegistry', () => {
	// This row round-trips through the sync file, so it can come back as
	// anything a past version or a hand-edited JSON put there.
	it.each([[null], [undefined], ['string'], [42], [['a']]])('ignores %s', (value) => {
		expect(parseRegistry(value)).toEqual({});
	});

	it('keeps only string ids', () => {
		expect(parseRegistry({ good: 'id', empty: '', wrong: 7 })).toEqual({ good: 'id' });
	});
});

describe('event sheet ids', () => {
	it('is empty before anything is exported', async () => {
		expect(await getEventSheetId('a@x.com', 'summer')).toBeNull();
	});

	it('remembers the document per account and event', async () => {
		await setEventSheetId('a@x.com', 'summer', 'sheet-1');
		await setEventSheetId('b@x.com', 'summer', 'sheet-2');

		expect(await getEventSheetId('a@x.com', 'summer')).toBe('sheet-1');
		expect(await getEventSheetId('b@x.com', 'summer')).toBe('sheet-2');
		expect(await getEventSheetId('a@x.com', 'winter')).toBeNull();
	});

	it('replaces the id when the document was recreated', async () => {
		await setEventSheetId('a@x.com', 'summer', 'sheet-1');
		await setEventSheetId('a@x.com', 'summer', 'sheet-2');
		expect(await getEventSheetId('a@x.com', 'summer')).toBe('sheet-2');
	});

	// One shared settings row read-modify-written by two exports: without the
	// queue the second read sees the pre-write value and drops the first id.
	it('keeps both ids when two exports land together', async () => {
		await Promise.all([
			setEventSheetId('a@x.com', 'summer', 'sheet-1'),
			setEventSheetId('a@x.com', 'winter', 'sheet-2')
		]);
		expect(await getEventSheetId('a@x.com', 'summer')).toBe('sheet-1');
		expect(await getEventSheetId('a@x.com', 'winter')).toBe('sheet-2');
	});
});
