import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RangeCardVM } from '../../src/lib/db/events';

const getFreshAuth = vi.fn();
const uploadSpreadsheet = vi.fn();
const collectEventVerses = vi.fn();

vi.mock('../../src/lib/cloud/session', () => ({ getFreshAuth }));
vi.mock('../../src/lib/cloud/sheets', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/cloud/sheets')>()),
	uploadSpreadsheet
}));
vi.mock('../../src/lib/export/eventExport', () => ({ collectEventVerses }));

const { exportEventToSheets } = await import('../../src/lib/export/eventSheetExport');
const { getEventSheetId, setEventSheetId } = await import('../../src/lib/export/sheetRegistry');
const { db } = await import('../../src/lib/db/local');

const RANGES = [] as RangeCardVM[];
const OPTIONS = { includeDifficulty: true, sortByScripture: true };
const VERSE = {
	packageAbbreviation: '100',
	no: 1,
	title: '양육',
	cite: '출애굽기 18 : 20',
	body: '그들에게 율례와 법도를',
	startDifficulty: null,
	fullDifficulty: null
};

function connected() {
	getFreshAuth.mockResolvedValue({
		kind: 'ok',
		auth: { email: 'a@x.com', accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }
	});
}

beforeEach(async () => {
	vi.clearAllMocks();
	await db.delete();
	await db.open();
	collectEventVerses.mockResolvedValue([VERSE]);
	uploadSpreadsheet.mockResolvedValue({ id: 'sheet-1', created: true });
});

describe('exportEventToSheets', () => {
	// Resolving 900 verses to then discover nobody is signed in wastes the
	// reader's time on the likeliest failure of the whole flow.
	it.each(['not-connected', 'expired'] as const)('reports %s without reading verses', async (kind) => {
		getFreshAuth.mockResolvedValue({ kind });
		expect(await exportEventToSheets('summer', '여름 DAY', RANGES, OPTIONS, 'cid')).toEqual({
			kind
		});
		expect(collectEventVerses).not.toHaveBeenCalled();
	});

	// Same guard as the download path: a blank document reads as a successful
	// export of nothing.
	it('refuses to create an empty document', async () => {
		connected();
		collectEventVerses.mockResolvedValue([]);
		expect(await exportEventToSheets('summer', '여름 DAY', RANGES, OPTIONS, 'cid')).toEqual({
			kind: 'empty'
		});
		expect(uploadSpreadsheet).not.toHaveBeenCalled();
	});

	it('creates a document and returns where to open it', async () => {
		connected();
		expect(await exportEventToSheets('summer', '여름 DAY', RANGES, OPTIONS, 'cid')).toEqual({
			kind: 'ok',
			url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
			created: true
		});
		expect(await getEventSheetId('a@x.com', 'summer')).toBe('sheet-1');
	});

	it('updates the document it made last time', async () => {
		connected();
		await setEventSheetId('a@x.com', 'summer', 'sheet-1');
		uploadSpreadsheet.mockResolvedValue({ id: 'sheet-1', created: false });

		const result = await exportEventToSheets('summer', '여름 DAY', RANGES, OPTIONS, 'cid');
		expect(result).toMatchObject({ kind: 'ok', created: false });
		expect(uploadSpreadsheet).toHaveBeenCalledWith(
			'tok',
			'sheet-1',
			'여름 DAY 암송 현황',
			expect.any(Uint8Array)
		);
	});

	// The stale id was already replaced inside uploadSpreadsheet; if the new
	// one is not written back, every export from here on pays for a fresh
	// document and the reader accumulates duplicates in Drive.
	it('remembers a replacement id', async () => {
		connected();
		await setEventSheetId('a@x.com', 'summer', 'deleted-sheet');
		uploadSpreadsheet.mockResolvedValue({ id: 'sheet-2', created: true });

		await exportEventToSheets('summer', '여름 DAY', RANGES, OPTIONS, 'cid');
		expect(await getEventSheetId('a@x.com', 'summer')).toBe('sheet-2');
	});

	it('reports an upload failure rather than throwing at the caller', async () => {
		connected();
		uploadSpreadsheet.mockRejectedValue(new Error('Sheets create: HTTP 500'));
		expect(await exportEventToSheets('summer', '여름 DAY', RANGES, OPTIONS, 'cid')).toEqual({
			kind: 'error'
		});
	});
});
