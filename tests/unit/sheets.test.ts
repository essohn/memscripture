import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	spreadsheetName,
	spreadsheetUrl,
	uploadSpreadsheet
} from '../../src/lib/cloud/sheets';

const TOKEN = 'fake-access-token';
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x80]);
const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function okJson(id: string) {
	return { ok: true, status: 200, json: async () => ({ id }) };
}

/** The metadata part sits at the head of the multipart body, ahead of the
 *  binary workbook, so decoding the whole blob as text still reads cleanly. */
async function metadataOf(body: Blob): Promise<Record<string, string>> {
	const text = await body.text();
	const match = text.match(/\{.*?\}/s);
	return match ? JSON.parse(match[0]) : {};
}

describe('spreadsheetUrl', () => {
	it('addresses the document by id', () => {
		expect(spreadsheetUrl('abc123')).toBe('https://docs.google.com/spreadsheets/d/abc123/edit');
	});

	// Drive ids are URL-safe already, but the id arrives from a stored settings
	// row that sync round-trips — it is not this function's to trust.
	it('escapes an id that is not URL-safe', () => {
		expect(spreadsheetUrl('a b/c')).toContain('a%20b%2Fc');
	});
});

describe('spreadsheetName', () => {
	it('names the document after the event', () => {
		expect(spreadsheetName('2026 여름 암송 DAY')).toBe('2026 여름 암송 DAY 암송 현황');
	});

	// Drive mangles slashes in titles; nothing else in a Korean event title
	// needs sanitizing, unlike the filename path which also has Windows to
	// survive.
	it('replaces slashes', () => {
		expect(spreadsheetName('여름/가을 DAY')).toBe('여름-가을 DAY 암송 현황');
	});

	it('falls back rather than naming a document nothing', () => {
		expect(spreadsheetName('   ')).toBe('암송 현황');
	});
});

describe('uploadSpreadsheet — create', () => {
	it('POSTs a multipart upload and reports a new document', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okJson('new-id'));
		vi.stubGlobal('fetch', fetchMock);

		expect(await uploadSpreadsheet(TOKEN, null, '암송 현황', BYTES)).toEqual({
			id: 'new-id',
			created: true
		});

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('/upload/drive/v3/files?uploadType=multipart');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
		expect(init.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
	});

	// This is the whole reason the export can stay on the drive.file scope: the
	// Google mimeType in the metadata is what makes Drive convert the workbook
	// into a native Sheet instead of parking it as an attachment. Without it
	// the feature needs the sensitive Sheets scope and a verification review.
	it('asks Drive to convert the workbook to a native Sheet', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okJson('new-id'));
		vi.stubGlobal('fetch', fetchMock);
		await uploadSpreadsheet(TOKEN, null, '암송 현황', BYTES);
		expect(await metadataOf(fetchMock.mock.calls[0][1].body)).toEqual({
			name: '암송 현황',
			mimeType: SHEETS_MIME
		});
	});

	// A JS string cannot hold the workbook: every byte above 0x7f would be
	// replaced. The body has to stay binary all the way to fetch.
	it('sends the workbook bytes intact', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okJson('new-id'));
		vi.stubGlobal('fetch', fetchMock);
		await uploadSpreadsheet(TOKEN, null, '암송 현황', BYTES);

		const body = fetchMock.mock.calls[0][1].body as Blob;
		const bytes = new Uint8Array(await body.arrayBuffer());
		expect([...bytes].join(',')).toContain([...BYTES].join(','));
	});

	it('throws when the create fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		await expect(uploadSpreadsheet(TOKEN, null, 'x', BYTES)).rejects.toThrow(/HTTP 500/);
	});
});

describe('uploadSpreadsheet — update', () => {
	// Updating in place is what keeps the reader's link, sharing and any notes
	// they added; creating a second document every week would not.
	it('PATCHes the remembered document and reports it as existing', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okJson('old-id'));
		vi.stubGlobal('fetch', fetchMock);

		expect(await uploadSpreadsheet(TOKEN, 'old-id', '암송 현황', BYTES)).toEqual({
			id: 'old-id',
			created: false
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('/files/old-id?uploadType=multipart');
		expect(init.method).toBe('PATCH');
	});

	it('renames the document so the title follows the event', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okJson('old-id'));
		vi.stubGlobal('fetch', fetchMock);
		await uploadSpreadsheet(TOKEN, 'old-id', '새 이름', BYTES);
		expect((await metadataOf(fetchMock.mock.calls[0][1].body)).name).toBe('새 이름');
	});

	// The reader deleted the document, or is signed into a different account
	// than the one that made it. Neither is something they can act on, and
	// both leave them wanting the export they just asked for.
	it.each([404, 403])('creates a replacement when the remembered id is %i', async (status) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status })
			.mockResolvedValueOnce(okJson('replacement'));
		vi.stubGlobal('fetch', fetchMock);

		expect(await uploadSpreadsheet(TOKEN, 'stale-id', '암송 현황', BYTES)).toEqual({
			id: 'replacement',
			created: true
		});
		expect(fetchMock.mock.calls[1][1].method).toBe('POST');
	});

	// A 401 or a 500 is transient or fixable; silently making a second
	// document would leave the reader with two and no idea which is live.
	it('surfaces an update failure that is not a missing document', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		vi.stubGlobal('fetch', fetchMock);
		await expect(uploadSpreadsheet(TOKEN, 'old-id', 'x', BYTES)).rejects.toThrow(/HTTP 500/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
