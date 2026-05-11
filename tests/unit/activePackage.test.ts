import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	getActivePackageId,
	setActivePackage,
	clearActivePackage
} from '../../src/lib/db/activePackage';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('activePackage', () => {
	it('returns null when no active package set', async () => {
		expect(await getActivePackageId()).toBeNull();
	});

	it('round-trips set and get', async () => {
		await setActivePackage('60_krv');
		expect(await getActivePackageId()).toBe('60_krv');
	});

	it('overwrites previous value on set', async () => {
		await setActivePackage('60_krv');
		await setActivePackage('100_krv');
		expect(await getActivePackageId()).toBe('100_krv');
	});

	it('clearActivePackage returns to null', async () => {
		await setActivePackage('60_krv');
		await clearActivePackage();
		expect(await getActivePackageId()).toBeNull();
	});

	it('returns null when stored value is malformed (string)', async () => {
		await db.settings.put({ key: 'active_package', value: 'broken' });
		expect(await getActivePackageId()).toBeNull();
	});

	it('returns null when stored value lacks packageId field', async () => {
		await db.settings.put({ key: 'active_package', value: { setAt: 123 } });
		expect(await getActivePackageId()).toBeNull();
	});
});
