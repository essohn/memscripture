import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/cloud/google', () => ({
	getCurrentAuth: vi.fn(),
	// Wired into the orchestrator: performSync refreshes a near-expired token
	// before touching Drive. Mocked so tests don't reach real GIS code.
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

import { getCurrentAuth, refreshAccessToken } from '../../src/lib/cloud/google';
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
		settings: [],
		verseRatings: []
	};
}

const CLIENT_ID = 'client-id.apps.googleusercontent.com';

beforeEach(() => {
	// Comfortably outside the 5-minute refresh margin, so these cases exercise
	// the normal path. A near-expiry token is set explicitly where it matters.
	vi.mocked(getCurrentAuth).mockResolvedValue({
		email: 'u@x.com',
		accessToken: 'tok',
		expiresAt: Date.now() + 3_600_000
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('performSync', () => {
	it('not-authenticated → error result', async () => {
		vi.mocked(getCurrentAuth).mockResolvedValue(null);
		const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);
		expect(res.kind).toBe('error');
	});

	it('no remote → builds local and uploads as create', async () => {
		vi.mocked(findSyncFile).mockResolvedValue(null);
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'new' });
		const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);
		expect(res.kind).toBe('no-remote-uploaded');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBeNull();
	});

	it('remote equal → reports remote-equal, no IO', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);
		expect(res.kind).toBe('remote-equal');
		expect(uploadSyncFile).not.toHaveBeenCalled();
		expect(applySyncSnapshot).not.toHaveBeenCalled();
	});

	it('local newer → PATCH uploads local to existing file', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T09:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });
		const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);
		expect(res.kind).toBe('local-newer-uploaded');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBe('fid');
	});

	it('remote newer + user confirms → saves backup + applies remote', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T11:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);
		expect(res.kind).toBe('remote-newer-imported');
		expect(savePreSyncBackup).toHaveBeenCalledTimes(1);
		expect(applySyncSnapshot).toHaveBeenCalledTimes(1);
	});

	it('remote newer + user declines → no backup, no apply', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T11:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		const res = await performSync({ confirmOverwrite: async () => false }, CLIENT_ID);
		expect(res.kind).toBe('remote-newer-declined');
		expect(savePreSyncBackup).not.toHaveBeenCalled();
		expect(applySyncSnapshot).not.toHaveBeenCalled();
	});

	it('returns error result when a Drive call throws', async () => {
		vi.mocked(findSyncFile).mockRejectedValue(new Error('HTTP 500'));
		const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);
		expect(res.kind).toBe('error');
		if (res.kind === 'error') expect(res.message).toMatch(/500/);
	});

	// Google access tokens last an hour. Without these, a second sync the next
	// day 401s on every Drive call and the only way out is disconnect/reconnect.
	describe('token expiry', () => {
		function nearExpiry() {
			vi.mocked(getCurrentAuth).mockResolvedValue({
				email: 'u@x.com',
				accessToken: 'stale',
				expiresAt: Date.now() + 60_000 // inside the 5-minute margin
			});
		}

		it('refreshes a near-expired token and syncs with the new one', async () => {
			nearExpiry();
			vi.mocked(refreshAccessToken).mockResolvedValue({
				email: 'u@x.com',
				accessToken: 'fresh',
				expiresAt: Date.now() + 3_600_000
			});
			vi.mocked(findSyncFile).mockResolvedValue(null);
			vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
			vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'new' });

			const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);

			expect(res.kind).toBe('no-remote-uploaded');
			expect(refreshAccessToken).toHaveBeenCalledWith(CLIENT_ID, 'u@x.com');
			// The refreshed token must be the one that reaches Drive — passing the
			// stale one would 401 despite the successful refresh.
			expect(vi.mocked(findSyncFile).mock.calls[0][0]).toBe('fresh');
			expect(vi.mocked(uploadSyncFile).mock.calls[0][0]).toBe('fresh');
		});

		it('does not refresh a token with plenty of life left', async () => {
			vi.mocked(findSyncFile).mockResolvedValue(null);
			vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
			vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'new' });

			await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);

			expect(refreshAccessToken).not.toHaveBeenCalled();
		});

		it('reports a re-connect prompt when the silent refresh fails', async () => {
			nearExpiry();
			vi.mocked(refreshAccessToken).mockRejectedValue(new Error('interaction_required'));

			const res = await performSync({ confirmOverwrite: async () => true }, CLIENT_ID);

			expect(res.kind).toBe('error');
			if (res.kind === 'error') expect(res.message).toMatch(/다시 연결/);
			// Nothing may touch Drive with a token known to be spent.
			expect(findSyncFile).not.toHaveBeenCalled();
		});

		it('reports the same when no client id is configured to refresh with', async () => {
			nearExpiry();
			const res = await performSync({ confirmOverwrite: async () => true }, null);
			expect(res.kind).toBe('error');
			expect(refreshAccessToken).not.toHaveBeenCalled();
			expect(findSyncFile).not.toHaveBeenCalled();
		});
	});
});
