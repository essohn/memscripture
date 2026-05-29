import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getDataLastModified,
	touchDataModified
} from '../../src/lib/db/touchData';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('touchDataModified', () => {
	it('returns null when never touched', async () => {
		expect(await getDataLastModified()).toBeNull();
	});

	it('writes an ISO timestamp on touch', async () => {
		await touchDataModified();
		const v = await getDataLastModified();
		expect(typeof v).toBe('string');
		expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('overwrites the previous timestamp on each touch', async () => {
		await touchDataModified();
		const first = await getDataLastModified();
		await new Promise((r) => setTimeout(r, 5));
		await touchDataModified();
		const second = await getDataLastModified();
		expect(second).not.toBe(first);
		expect(second!.localeCompare(first!)).toBeGreaterThan(0);
	});
});
