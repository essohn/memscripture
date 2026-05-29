import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage } from '../../src/lib/db/verses';
import type { PackageMeta } from '../../src/lib/types';

beforeEach(async () => {
	await db.delete();
	await db.open();
});

describe('PackageMeta.kind backfill', () => {
	it('listPackages defaults missing kind to "builtin" for stored rows', async () => {
		// Insert a row without kind to mimic pre-migration data.
		const legacy = {
			id: 'legacy_pkg',
			name: 'Legacy',
			abbreviation: 'LP',
			verse_number: 5,
			translation: 'krv',
			translation_name: '개역한글',
			language: 'kor',
			copyright: '',
			copyright_text: '',
			version: 1,
			source: 'data/legacy.json',
			default: false
		} as PackageMeta;
		await db.packages.put(legacy);

		const all = await listPackages();
		const row = all.find((p) => p.id === 'legacy_pkg');
		expect(row?.kind).toBe('builtin');
	});

	it('installPackage early-returns when kind === "user" (no JSON fetch)', async () => {
		await db.packages.put({
			id: 'user_pkg',
			name: '내 구절',
			abbreviation: 'OYO',
			verse_number: 0,
			translation: 'krv',
			translation_name: '사용자',
			language: 'kor',
			copyright: '',
			copyright_text: '',
			version: 1,
			source: '',
			default: false,
			kind: 'user'
		});

		// Should resolve without throwing even though source is empty.
		await expect(installPackage('user_pkg')).resolves.toBeUndefined();
	});
});
