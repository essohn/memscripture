import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	downloadSyncFile,
	findSyncFile,
	uploadSyncFile
} from '../../src/lib/cloud/drive';
import type { SyncSnapshot } from '../../src/lib/sync/snapshot';

const TOKEN = 'fake-access-token';

function snapshotFixture(): SyncSnapshot {
	return {
		version: 1,
		exportedAt: '2026-05-29T00:00:00Z',
		lastModifiedAt: '2026-05-29T00:00:00Z',
		device: 'dev-test',
		oyo: { package: null, verses: [] },
		bookmarks: [],
		progress: [],
		activity: [],
		settings: [],
		verseRatings: []
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('findSyncFile', () => {
	it('returns null when the appData listing is empty', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ files: [] })
		}));
		expect(await findSyncFile(TOKEN)).toBeNull();
	});

	it('returns the first match with id + modifiedTime', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				files: [{ id: 'fid', modifiedTime: '2026-05-29T10:00:00Z' }]
			})
		}));
		const result = await findSyncFile(TOKEN);
		expect(result).toEqual({ id: 'fid', modifiedTime: '2026-05-29T10:00:00Z' });
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
		await expect(findSyncFile(TOKEN)).rejects.toThrow(/HTTP 401/);
	});
});

describe('downloadSyncFile', () => {
	it('GETs alt=media and parses the JSON body', async () => {
		const payload = snapshotFixture();
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
		vi.stubGlobal('fetch', fetchMock);
		const result = await downloadSyncFile(TOKEN, 'fid');
		expect(result).toEqual(payload);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toContain('alt=media');
		expect(url).toContain('fid');
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(downloadSyncFile(TOKEN, 'fid')).rejects.toThrow(/HTTP 404/);
	});
});

describe('uploadSyncFile', () => {
	it('POSTs a multipart body on first upload (no fileId)', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: 'new-id' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const result = await uploadSyncFile(TOKEN, null, snapshotFixture());
		expect(result.id).toBe('new-id');
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toContain('uploadType=multipart');
		expect(options.method).toBe('POST');
		expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
	});

	it('PATCHes by fileId on subsequent upload', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: 'existing' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const result = await uploadSyncFile(TOKEN, 'existing', snapshotFixture());
		expect(result.id).toBe('existing');
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toContain('existing');
		expect(url).toContain('uploadType=media');
		expect(options.method).toBe('PATCH');
		expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
		await expect(uploadSyncFile(TOKEN, null, snapshotFixture())).rejects.toThrow(/HTTP 503/);
	});
});
