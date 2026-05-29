import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/local';
import { listPackages, installPackage } from '../../src/lib/db/verses';
import {
	OYO_PACKAGE_ID,
	seedOyoPackageIfMissing,
	createOyoVerse,
	updateOyoVerse,
	deleteOyoVerse,
	listOyoVerses,
	restoreOyoVerse
} from '../../src/lib/db/oyo';
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

describe('seedOyoPackageIfMissing', () => {
	it('inserts the OYO row when missing', async () => {
		await seedOyoPackageIfMissing();
		const row = await db.packages.get(OYO_PACKAGE_ID);
		expect(row).toBeDefined();
		expect(row?.id).toBe(OYO_PACKAGE_ID);
		expect(row?.kind).toBe('user');
		expect(row?.name).toBe('내 구절');
		expect(row?.abbreviation).toBe('OYO');
	});

	it('is idempotent', async () => {
		await seedOyoPackageIfMissing();
		await seedOyoPackageIfMissing();
		const all = await db.packages.where('id').equals(OYO_PACKAGE_ID).toArray();
		expect(all).toHaveLength(1);
	});

	it('does not overwrite an existing OYO row (preserves user state)', async () => {
		// Simulate an OYO row with custom name (e.g., user renamed in a future phase).
		await db.packages.put({
			id: OYO_PACKAGE_ID,
			name: '내가 바꾼 이름',
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
		await seedOyoPackageIfMissing();
		const row = await db.packages.get(OYO_PACKAGE_ID);
		expect(row?.name).toBe('내가 바꾼 이름');
	});
});

describe('OYO verse CRUD', () => {
	it('createOyoVerse allocates no = max+1 starting from 1', async () => {
		const v1 = await createOyoVerse({ cite: '요한복음 3:16', title: '', w: '하나님이 …' });
		expect(v1.no).toBe(1);
		const v2 = await createOyoVerse({ cite: '시편 23:1', title: '주는 나의 목자', w: '주는 …' });
		expect(v2.no).toBe(2);
	});

	it('createOyoVerse leaves no a monotonic sequence even after deletes', async () => {
		await createOyoVerse({ cite: 'a', title: '', w: 'aa' });
		await createOyoVerse({ cite: 'b', title: '', w: 'bb' });
		await deleteOyoVerse(1);
		const v3 = await createOyoVerse({ cite: 'c', title: '', w: 'cc' });
		expect(v3.no).toBe(3); // not 2 — holes allowed
	});

	it('listOyoVerses returns only oyo rows, sorted by no ascending', async () => {
		await createOyoVerse({ cite: 'a', title: '', w: 'aa' });
		await createOyoVerse({ cite: 'b', title: '', w: 'bb' });
		// Drop a non-OYO row alongside to confirm filtering
		await db.verses.put({ package_id: 'other', no: 1, i: 1, title: 't', cite: 'c', w: 'w' });
		const list = await listOyoVerses();
		expect(list.map((v) => v.no)).toEqual([1, 2]);
	});

	it('updateOyoVerse merges fields without changing no', async () => {
		const v = await createOyoVerse({ cite: 'a', title: 't1', w: 'w1' });
		await updateOyoVerse(v.no, { title: 't2' });
		const list = await listOyoVerses();
		expect(list[0].title).toBe('t2');
		expect(list[0].cite).toBe('a');
		expect(list[0].no).toBe(v.no);
	});

	it('deleteOyoVerse removes the row and returns the snapshot', async () => {
		const v = await createOyoVerse({ cite: 'a', title: '', w: 'w' });
		const snapshot = await deleteOyoVerse(v.no);
		expect(snapshot?.no).toBe(v.no);
		expect(await listOyoVerses()).toHaveLength(0);
	});

	it('restoreOyoVerse reinserts a deleted verse at the same no', async () => {
		const v = await createOyoVerse({ cite: 'a', title: '', w: 'w' });
		const snapshot = await deleteOyoVerse(v.no);
		await restoreOyoVerse(snapshot!);
		const list = await listOyoVerses();
		expect(list).toHaveLength(1);
		expect(list[0].no).toBe(v.no);
	});

	it('updateOyoVerse on a non-existent no is a silent no-op', async () => {
		await expect(updateOyoVerse(999, { title: 'x' })).resolves.toBeUndefined();
	});

	it('restoreOyoVerse ignores verses from other packages', async () => {
		const foreign = {
			package_id: 'other',
			no: 1,
			i: 1,
			title: 't',
			cite: 'c',
			w: 'w'
		};
		await restoreOyoVerse(foreign);
		expect(await listOyoVerses()).toHaveLength(0);
	});
});
