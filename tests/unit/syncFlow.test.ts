import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/cloud/google', () => ({
	getCurrentAuth: vi.fn(),
	// refreshAccessToken is wired into the orchestrator in a follow-up phase
	// (401 → silent refresh → retry). Mocked here so the module replacement
	// is complete and importing tests don't see real GIS code.
	refreshAccessToken: vi.fn()
}));
vi.mock('../../src/lib/cloud/drive', () => ({
	findSyncFile: vi.fn(),
	downloadSyncFile: vi.fn(),
	uploadSyncFile: vi.fn()
}));
vi.mock('../../src/lib/sync/snapshot', () => ({
	buildSyncSnapshot: vi.fn(),
	applySyncSnapshot: vi.fn()
}));
vi.mock('../../src/lib/sync/preSyncBackup', () => ({
	savePreSyncBackup: vi.fn(),
	loadPreSyncBackup: vi.fn(),
	clearPreSyncBackup: vi.fn()
}));

import { getCurrentAuth } from '../../src/lib/cloud/google';
import {
	downloadSyncFile,
	findSyncFile,
	uploadSyncFile
} from '../../src/lib/cloud/drive';
import {
	applySyncSnapshot,
	buildSyncSnapshot
} from '../../src/lib/sync/snapshot';
import { savePreSyncBackup } from '../../src/lib/sync/preSyncBackup';
import { performSync } from '../../src/lib/sync/syncFlow';

function snap(lastModifiedAt: string) {
	return {
		version: 1 as const,
		exportedAt: 'irrelevant',
		lastModifiedAt,
		device: 'dev-test',
		oyo: { package: null, verses: [] },
		bookmarks: [],
		progress: [],
		activity: [],
		settings: []
	};
}

beforeEach(() => {
	vi.mocked(getCurrentAuth).mockResolvedValue({
		email: 'u@x.com',
		accessToken: 'tok',
		expiresAt: Date.now() + 60_000
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('performSync', () => {
	it('not-authenticated → error result', async () => {
		vi.mocked(getCurrentAuth).mockResolvedValue(null);
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('error');
	});

	it('no remote → builds local and uploads as create', async () => {
		vi.mocked(findSyncFile).mockResolvedValue(null);
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'new' });
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('no-remote-uploaded');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBeNull();
	});

	it('remote equal → reports remote-equal, no IO', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('remote-equal');
		expect(uploadSyncFile).not.toHaveBeenCalled();
		expect(applySyncSnapshot).not.toHaveBeenCalled();
	});

	it('local newer → PATCH uploads local to existing file', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T09:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('local-newer-uploaded');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBe('fid');
	});

	it('remote newer + user confirms → saves backup + applies remote', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T11:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('remote-newer-imported');
		expect(savePreSyncBackup).toHaveBeenCalledTimes(1);
		expect(applySyncSnapshot).toHaveBeenCalledTimes(1);
	});

	it('remote newer + user declines → no backup, no apply', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T11:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => false });
		expect(res.kind).toBe('remote-newer-declined');
		expect(savePreSyncBackup).not.toHaveBeenCalled();
		expect(applySyncSnapshot).not.toHaveBeenCalled();
	});

	it('returns error result when a Drive call throws', async () => {
		vi.mocked(findSyncFile).mockRejectedValue(new Error('HTTP 500'));
		const res = await performSync({ confirmOverwrite: async () => true });
		expect(res.kind).toBe('error');
		if (res.kind === 'error') expect(res.message).toMatch(/500/);
	});
});
