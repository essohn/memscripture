import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage, readVerse, listGroups } from '../../src/lib/db/verses';

beforeEach(async () => {
	await db.delete();
	await db.open();
	vi.restoreAllMocks();
});

const samplePackages = {
	'5_krv': {
		id: '5_krv', name: '그리스도인의 확신 5구절', verse_number: 5,
		translation: 'krv', translation_name: '개역한글', abbreviation: '5구절',
		language: 'kor', copyright: '', copyright_text: '', version: 1,
		source: 'data/5_krv.json', default: true
	}
};
const sampleVerses = [
	{ i: 1, title: 't1', cite: 'c1', w: 'w1' },
	{ i: 2, title: 't2', cite: 'c2', w: 'w2' }
];

function mockFetch(map: Record<string, unknown>) {
	global.fetch = vi.fn(async (url: any) => {
		const u = String(url);
		const key = Object.keys(map).find((k) => u.endsWith(k));
		if (!key) return new Response('not found', { status: 404 });
		return new Response(JSON.stringify(map[key]), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}) as any;
}

describe('listPackages', () => {
	it('fetches curated and includes the OYO row, then serves cached on repeat', async () => {
		mockFetch({ 'data/packages.json': samplePackages });
		const packs = await listPackages();
		// 1 curated (mocked) + 1 OYO (seeded inside listPackages).
		expect(packs).toHaveLength(2);
		expect(packs.find((p) => p.kind === 'builtin')?.name).toBe('그리스도인의 확신 5구절');
		expect(packs.find((p) => p.kind === 'user')?.id).toBe('oyo');

		(global.fetch as any).mockClear();
		const cached = await listPackages();
		expect(cached).toHaveLength(2);
		expect(global.fetch).not.toHaveBeenCalled();
	});
});

describe('installPackage', () => {
	it('downloads and stores verses by package id', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses
		});
		await listPackages();
		await installPackage('5_krv');
		const stored = await db.verses.where('package_id').equals('5_krv').toArray();
		expect(stored).toHaveLength(2);
		expect(stored.find((v) => v.no === 1)?.title).toBe('t1');
	});

	it('is idempotent', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses
		});
		await listPackages();
		await installPackage('5_krv');
		await installPackage('5_krv');
		const count = await db.verses.where('package_id').equals('5_krv').count();
		expect(count).toBe(2);
	});
});

describe('readVerse', () => {
	it('returns the verse for (package, no)', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/5_krv.json': sampleVerses
		});
		await listPackages();
		await installPackage('5_krv');
		const v = await readVerse('5_krv', 2);
		expect(v?.cite).toBe('c2');
	});
});

const sampleGroups = [
	{ package_id: '5_krv', group_name: '그리스도인의 확신 5구절', level: 1, index: [1, 2, 3, 4, 5] }
];

describe('listGroups', () => {
	it('fetches groups for a package', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		const groups = await listGroups('5_krv');
		expect(groups).toHaveLength(1);
		expect(groups[0].group_name).toContain('그리스도인의 확신');
	});

	it('returns empty array for unknown package', async () => {
		mockFetch({
			'data/packages.json': samplePackages,
			'data/packages_index.json': sampleGroups
		});
		await listPackages();
		const groups = await listGroups('unknown');
		expect(groups).toEqual([]);
	});
});

// The reader's report: two 나의 구절 in the library, the card saying 0구절.
//
// PackageCard renders PackageMeta.verse_number, a stored counter that only
// db/oyo's own create/delete/restore maintain. The sync restore is a second
// writer — it bulkPuts the OYO verse rows straight into Dexie — so a snapshot
// whose package row disagrees with its verses (or carries no package row at
// all) lands a count that nothing afterwards ever corrects.
describe('listPackages — the OYO count is reconciled, not trusted', () => {
	async function seedOyoRows(count: number, storedCount: number) {
		mockFetch({ 'packages.json': {} });
		await db.packages.put({
			id: 'oyo',
			name: '나의 구절(OYO)',
			abbreviation: 'OYO',
			verse_number: storedCount,
			translation: 'krv',
			translation_name: '사용자',
			language: 'kor',
			copyright: '',
			copyright_text: '',
			version: 1,
			source: '',
			default: false,
			kind: 'user'
		} as never);
		await db.verses.bulkPut(
			Array.from({ length: count }, (_, i) => ({
				package_id: 'oyo',
				no: i + 1,
				i: i + 1,
				title: `제목 ${i + 1}`,
				cite: `시편 118 : ${i + 1}`,
				w: `본문 ${i + 1}`
			})) as never
		);
	}

	it('reports the verses that are actually there, not the stored counter', async () => {
		await seedOyoRows(2, 0);
		const oyo = (await listPackages()).find((p) => p.id === 'oyo');
		expect(oyo?.verse_number).toBe(2);
	});

	// Read paths must agree with the table, so the correction has to reach
	// Dexie — otherwise the next snapshot built from this device would carry
	// the wrong number back out to every other one.
	it('writes the correction back rather than only dressing up the read', async () => {
		await seedOyoRows(2, 0);
		await listPackages();
		expect((await db.packages.get('oyo'))?.verse_number).toBe(2);
	});

	it('corrects a counter that overshoots as well as one that lags', async () => {
		await seedOyoRows(2, 9);
		const oyo = (await listPackages()).find((p) => p.id === 'oyo');
		expect(oyo?.verse_number).toBe(2);
	});

	// An empty OYO is a real state, not a drift to be repaired upward.
	it('leaves an OYO with no verses at zero', async () => {
		await seedOyoRows(0, 0);
		const oyo = (await listPackages()).find((p) => p.id === 'oyo');
		expect(oyo?.verse_number).toBe(0);
	});

	// The curated packages carry their count from the registry they were
	// installed from; recounting them would fight their own installer.
	it('leaves the curated packages alone', async () => {
		mockFetch({ 'packages.json': samplePackages });
		const five = (await listPackages()).find((p) => p.id === '5_krv');
		expect(five?.verse_number).toBe(5);
	});
});
