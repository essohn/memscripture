import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	installPackage,
	listPackages,
	listVerses,
	loadPackageData,
	_resetPackageCaches
} from '../../src/lib/db/verses';

/** The catalog as it ships in packages.json, at whatever content version the
 *  test needs. Only the fields installPackage reads matter here. */
function catalog(version: number) {
	return {
		'5_krv': {
			id: '5_krv',
			name: '샘플',
			verse_number: 2,
			translation: 'krv',
			translation_name: '개역한글',
			abbreviation: '샘플',
			language: 'kor',
			copyright: '',
			copyright_text: '',
			version,
			source: 'data/5_krv.json',
			default: true
		}
	};
}

const versesV1 = [
	{ i: 1, title: 't1', cite: 'c1', w: '죄우에 날선' },
	{ i: 2, title: 't2', cite: 'c2', w: 'w2' }
];
const versesV2 = [
	{ i: 1, title: 't1', cite: 'c1', w: '좌우에 날선' },
	{ i: 2, title: 't2', cite: 'c2', w: 'w2' }
];

function mockFetch(map: Record<string, unknown>) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
		const u = String(url);
		const key = Object.keys(map).find((k) => u.endsWith(k));
		if (!key) return new Response('not found', { status: 404 });
		return new Response(JSON.stringify(map[key]), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	});
}

/** Mimics a fresh page load on a new deploy: module caches gone, catalog
 *  serving `version`, verse JSON serving `verses`. */
function newSession(version: number, verses: unknown) {
	vi.restoreAllMocks();
	_resetPackageCaches();
	return mockFetch({ 'data/packages.json': catalog(version), 'data/5_krv.json': verses });
}

async function firstInstallAt(version: number, verses: unknown) {
	newSession(version, verses);
	await listPackages();
	await installPackage('5_krv');
}

beforeEach(async () => {
	await db.delete();
	await db.open();
	vi.restoreAllMocks();
	_resetPackageCaches();
});

describe('version-gated package content', () => {
	it('records the catalog version when a package is first installed', async () => {
		await firstInstallAt(3, versesV1);
		expect((await db.packages.get('5_krv'))?.installedVersion).toBe(3);
	});

	it('re-downloads the verses when the catalog version is newer', async () => {
		await firstInstallAt(1, versesV1);

		newSession(2, versesV2);
		await installPackage('5_krv');

		const rows = await listVerses('5_krv');
		expect(rows[0].w).toBe('좌우에 날선');
	});

	it('leaves the verses alone when the catalog version is unchanged', async () => {
		await firstInstallAt(1, versesV1);

		const fetchSpy = newSession(1, versesV2);
		await installPackage('5_krv');

		expect(fetchSpy.mock.calls.map(String).some((u) => u.includes('5_krv.json'))).toBe(false);
		expect((await listVerses('5_krv'))[0].w).toBe('죄우에 날선');
	});

	// Every package shipped so far was version 1, so a row with no recorded
	// version is a version-1 install — not a version-0 one that must refresh.
	it('treats a package installed before versioning as version 1', async () => {
		await firstInstallAt(1, versesV1);
		const row = await db.packages.get('5_krv');
		delete (row as { installedVersion?: number }).installedVersion;
		await db.packages.put(row!);

		const fetchSpy = newSession(1, versesV2);
		await installPackage('5_krv');

		expect(fetchSpy.mock.calls.map(String).some((u) => u.includes('5_krv.json'))).toBe(false);
	});

	it('refreshes a pre-versioning install once the catalog moves past 1', async () => {
		await firstInstallAt(1, versesV1);
		const row = await db.packages.get('5_krv');
		delete (row as { installedVersion?: number }).installedVersion;
		await db.packages.put(row!);

		newSession(2, versesV2);
		await installPackage('5_krv');

		expect((await listVerses('5_krv'))[0].w).toBe('좌우에 날선');
	});

	// Offline must not cost the reader the verses they already have.
	it('keeps the installed verses when the catalog cannot be fetched', async () => {
		await firstInstallAt(1, versesV1);

		vi.restoreAllMocks();
		_resetPackageCaches();
		mockFetch({ 'data/5_krv.json': versesV2 }); // packages.json → 404

		await expect(installPackage('5_krv')).resolves.toBeUndefined();
		expect((await listVerses('5_krv'))[0].w).toBe('죄우에 날선');
	});

	// The DB is only half the story: loadPackageData memoizes verses per
	// package, so a refresh that leaves that memo standing changes nothing on
	// screen. Staged without resetting the module caches on purpose — clearing
	// them would hide the very bug this is here to catch.
	it('drops the memoized package data when the verses are refreshed', async () => {
		vi.restoreAllMocks();
		_resetPackageCaches();
		mockFetch({
			'data/packages.json': catalog(1),
			'data/5_krv.json': versesV1,
			'data/packages_index.json': []
		});
		await listPackages();
		expect((await loadPackageData('5_krv')).verses[0].w).toBe('죄우에 날선');

		// Make the install look stale the way a newer catalog would, then serve
		// corrected text — with the memo still warm from the read above.
		const row = await db.packages.get('5_krv');
		await db.packages.put({ ...row!, installedVersion: 0 });
		mockFetch({
			'data/packages.json': catalog(1),
			'data/5_krv.json': versesV2,
			'data/packages_index.json': []
		});

		expect((await loadPackageData('5_krv')).verses[0].w).toBe('좌우에 날선');
	});
});
