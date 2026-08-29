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

	// A device that has never recorded a mutation has no stamp to report, and
	// buildSyncSnapshot renders that absence as ''. Two absences are not two
	// matching values: this is what stranded a second browser for good — it
	// held nothing, the remote held a year of records, and both said ''. The
	// sync returned before reading either, so no reload and no reconnect ever
	// got past it.
	it('reads the remote when neither side carries a stamp', async () => {
		const remote = {
			...snap(''),
			verseRatings: [
				{ id: 'p:1', packageId: 'p', verseNo: 1, startDifficulty: 3, fullDifficulty: 3, updatedAt: 10 }
			]
		};
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(remote);
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap(''));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });

		const res = await performSync({}, CLIENT_ID);

		expect(res.kind).toBe('merged');
		const applied = vi.mocked(applySyncSnapshot).mock.calls[0][0] as {
			verseRatings: unknown[];
		};
		expect(applied.verseRatings).toHaveLength(1);
	});

	// Same absence, written by a snapshot old enough to have no such field at
	// all. `undefined === undefined` reads as equal just as readily as ''.
	it('reads the remote when neither side has the field at all', async () => {
		const { lastModifiedAt: _r, ...remote } = snap('');
		const { lastModifiedAt: _l, ...local } = snap('');
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue({
			...remote,
			verseRatings: [
				{ id: 'p:1', packageId: 'p', verseNo: 1, startDifficulty: 3, fullDifficulty: 3, updatedAt: 10 }
			]
		});
		vi.mocked(buildSyncSnapshot).mockResolvedValue(
			local as unknown as ReturnType<typeof snap>
		);
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });

		const res = await performSync({}, CLIENT_ID);

		expect(res.kind).toBe('merged');
	});

	it('an existing remote file is merged, applied locally and uploaded back', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T09:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });

		const res = await performSync({}, CLIENT_ID);

		expect(res.kind).toBe('merged');
		// Both sides end up holding the same merged snapshot.
		expect(vi.mocked(applySyncSnapshot)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(uploadSyncFile).mock.calls[0][1]).toBe('fid');
		expect(vi.mocked(uploadSyncFile).mock.calls[0][2]).toEqual(
			vi.mocked(applySyncSnapshot).mock.calls[0][0]
		);
	});

	// The direction that used to run unattended. A device whose clock is ahead
	// but whose records are thin must no longer be able to replace the remote.
	it('never uploads a snapshot that drops what the remote had', async () => {
		const remote = {
			...snap('2026-01-01T00:00:00Z'),
			verseRatings: [
				{ id: 'p:1', packageId: 'p', verseNo: 1, startDifficulty: 5, fullDifficulty: 5, updatedAt: 10 }
			]
		};
		const freshLocal = { ...snap('2026-08-20T00:00:00Z'), verseRatings: [] };
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(remote);
		vi.mocked(buildSyncSnapshot).mockResolvedValue(freshLocal);
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });

		await performSync({}, CLIENT_ID);

		const uploaded = vi.mocked(uploadSyncFile).mock.calls[0][2] as { verseRatings: unknown[] };
		expect(uploaded.verseRatings).toHaveLength(1);
	});

	it('keeps a pre-sync backup, the only way back from a bad remote file', async () => {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T09:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });

		await performSync({}, CLIENT_ID);

		expect(vi.mocked(savePreSyncBackup)).toHaveBeenCalledTimes(1);
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

describe('the apply gate', () => {
	function differing() {
		vi.mocked(findSyncFile).mockResolvedValue({ id: 'fid', modifiedTime: 'x' });
		vi.mocked(downloadSyncFile).mockResolvedValue(snap('2026-05-29T09:00:00Z'));
		vi.mocked(buildSyncSnapshot).mockResolvedValue(snap('2026-05-29T10:00:00Z'));
		vi.mocked(uploadSyncFile).mockResolvedValue({ id: 'fid' });
	}

	// An unattended sync landing mid-점검 would rewrite every table under the
	// reader. Refusing must leave BOTH sides untouched — a merge uploaded but
	// not applied would leave this device behind its own remote file.
	it('writes nothing, locally or remotely, when the gate refuses', async () => {
		differing();
		const res = await performSync(
			{ beforeApply: () => Promise.reject(new Error('cards still open')) },
			CLIENT_ID
		);
		expect(res).toEqual({ kind: 'deferred' });
		expect(applySyncSnapshot).not.toHaveBeenCalled();
		expect(uploadSyncFile).not.toHaveBeenCalled();
		expect(savePreSyncBackup).not.toHaveBeenCalled();
	});

	it('proceeds once the gate opens', async () => {
		differing();
		const res = await performSync({ beforeApply: () => Promise.resolve() }, CLIENT_ID);
		expect(res).toEqual({ kind: 'merged' });
		expect(applySyncSnapshot).toHaveBeenCalled();
		expect(uploadSyncFile).toHaveBeenCalled();
	});

	// The gate guards writes, not reads. Everything before it is a fetch, and
	// asking a reader to wait before we even know there is anything to apply
	// would hold the gesture open for nothing.
	it('is consulted only after the remote has been read and merged', async () => {
		differing();
		const order: string[] = [];
		vi.mocked(downloadSyncFile).mockImplementation(async () => {
			order.push('download');
			return snap('2026-05-29T09:00:00Z');
		});
		vi.mocked(applySyncSnapshot).mockImplementation(async () => {
			order.push('apply');
		});
		await performSync(
			{
				beforeApply: async () => {
					order.push('gate');
				}
			},
			CLIENT_ID
		);
		expect(order).toEqual(['download', 'gate', 'apply']);
	});

	// The attended button passes no gate, and must behave exactly as before.
	it('applies without a gate when none is given', async () => {
		differing();
		const res = await performSync({}, CLIENT_ID);
		expect(res).toEqual({ kind: 'merged' });
		expect(applySyncSnapshot).toHaveBeenCalled();
	});
});
