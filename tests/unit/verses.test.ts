import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage, readVerse } from '../../src/lib/db/verses';

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
	it('fetches and caches packages', async () => {
		mockFetch({ 'data/packages.json': samplePackages });
		const packs = await listPackages();
		expect(packs).toHaveLength(1);
		expect(packs[0].name).toBe('그리스도인의 확신 5구절');

		(global.fetch as any).mockClear();
		const cached = await listPackages();
		expect(cached).toHaveLength(1);
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
