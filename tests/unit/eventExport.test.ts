import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import { collectEventVerses, exportEventXlsx, exportFileName } from '../../src/lib/export/eventExport';

beforeEach(async () => {
	await db.delete();
	await db.open();
	await db.packages.put({
		id: '900_krv',
		name: '무장 900구절',
		abbreviation: '900구절'
	} as never);
	await db.verses.bulkPut([
		{ package_id: '900_krv', no: 127, i: 127, title: '양  육', cite: '출애굽기 18 : 20', w: '본문1' },
		{ package_id: '900_krv', no: 128, i: 128, title: '양  육', cite: '신명기 6 : 7', w: '본문2' }
	] as never);
	await db.verseRatings.put({
		id: '900_krv:127',
		packageId: '900_krv',
		verseNo: 127,
		startDifficulty: 2,
		fullDifficulty: 4
	} as never);
});

describe('collectEventVerses', () => {
	const ranges = [
		{ label: '900구절', done: 0, total: 2, href: '', packageId: '900_krv', verseNos: [127, 128] }
	];

	it('resolves verses with their ratings', async () => {
		const out = await collectEventVerses(ranges);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			packageAbbreviation: '900구절',
			no: 127,
			cite: '출애굽기 18 : 20',
			body: '본문1',
			startDifficulty: 2,
			fullDifficulty: 4
		});
	});

	it('reports null difficulty for an unrated verse', async () => {
		const out = await collectEventVerses(ranges);
		expect(out[1].startDifficulty).toBeNull();
		expect(out[1].fullDifficulty).toBeNull();
	});

	it('skips verse numbers with no matching row', async () => {
		const out = await collectEventVerses([{ ...ranges[0], verseNos: [127, 9999] }]);
		expect(out.map((v) => v.no)).toEqual([127]);
	});

	// `??` would let an empty-string abbreviation through as-is, leaving 구분
	// blank for an installed package that just hasn't set one.
	it('falls back to the package id when abbreviation is an empty string', async () => {
		await db.packages.put({ id: '900_krv', name: '무장 900구절', abbreviation: '' } as never);
		const out = await collectEventVerses(ranges);
		expect(out[0].packageAbbreviation).toBe('900_krv');
	});
});

describe('exportFileName', () => {
	it('joins the event title and the day', () => {
		expect(exportFileName('2026 여름 암송 DAY', '2026-08-10')).toBe(
			'2026 여름 암송 DAY-2026-08-10.xlsx'
		);
	});

	it('strips characters that are illegal in filenames', () => {
		expect(exportFileName('a/b:c*d', '2026-08-10')).toBe('a-b-c-d-2026-08-10.xlsx');
	});
});

describe('exportEventXlsx', () => {
	const ranges = [
		{ label: '900구절', done: 0, total: 2, href: '', packageId: '900_krv', verseNos: [127, 128] }
	];
	const options = { includeDifficulty: true, sort: 'booklet' as const };

	beforeEach(() => {
		// jsdom does not implement Blob URLs; stub the pieces downloadBlob
		// touches so the success path is exercisable without a real browser.
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn(() => 'blob:mock-url'),
			revokeObjectURL: vi.fn()
		});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('produces a download when verses resolve', async () => {
		const onEmpty = vi.fn();
		const onError = vi.fn();

		const produced = await exportEventXlsx(
			{ title: '2026 여름 암송 DAY', dueAt: '2026-08-31' }, ranges, options, '2026-08-10', {
			onEmpty,
			onError
		});

		expect(produced).toBe(true);
		expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
		expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
		expect(onEmpty).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it('routes zero resolved verses to onEmpty without producing a file', async () => {
		const onEmpty = vi.fn();
		const onError = vi.fn();

		const produced = await exportEventXlsx(
			{ title: '2026 여름 암송 DAY', dueAt: '2026-08-31' },
			[{ ...ranges[0], verseNos: [] }],
			options,
			'2026-08-10',
			{ onEmpty, onError }
		);

		expect(produced).toBe(false);
		expect(onEmpty).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it('routes a throwing DB read to onError instead of leaving the caller with no feedback', async () => {
		const onEmpty = vi.fn();
		const onError = vi.fn();
		vi.spyOn(db.packages, 'get').mockRejectedValueOnce(new Error('IDB version-change lock held'));

		const produced = await exportEventXlsx(
			{ title: '2026 여름 암송 DAY', dueAt: '2026-08-31' }, ranges, options, '2026-08-10', {
			onEmpty,
			onError
		});

		expect(produced).toBe(false);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onEmpty).not.toHaveBeenCalled();
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});
});
