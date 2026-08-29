import { getFreshAuth } from '$lib/cloud/session';
import {
	downloadSyncFile,
	findSyncFile,
	uploadSyncFile
} from '$lib/cloud/drive';
import {
	applySyncSnapshot,
	buildSyncSnapshot,
	type SyncSnapshot
} from './snapshot';
import { savePreSyncBackup } from './preSyncBackup';
import { mergeSnapshots } from './merge';

export type SyncResult =
	| { kind: 'no-remote-uploaded' }
	| { kind: 'remote-equal' }
	| { kind: 'merged' }
	/** The gate never opened — nothing was written locally or remotely. */
	| { kind: 'deferred' }
	| { kind: 'error'; message: string };

export interface SyncHandlers {
	/** Kept for callers that still pass one. Nothing asks any more: a merge
	 *  discards nothing, so there is no longer a question to put to the user. */
	confirmOverwrite?: () => Promise<boolean>;
	/**
	 * Awaited immediately before the merged snapshot is written locally.
	 *
	 * Applying rewrites every table, which is fine when a person pressed the
	 * button and is watching, and not fine when a sync starts on its own while
	 * they are mid-점검 — the verse would change underneath them. A caller that
	 * syncs unattended passes a gate here; rejecting it abandons the sync with
	 * nothing written on either side, to be retried later.
	 */
	beforeApply?: () => Promise<void>;
}

/**
 * Single-button sync orchestrator.
 *
 * - not authenticated → error
 * - no remote file    → upload local (create)
 * - otherwise         → merge both, apply locally, upload the result
 *
 * It used to compare one timestamp and replace the whole snapshot with the
 * newer side, which deleted the loser's records. Worse, the guards were on the
 * wrong branch: overwriting this device asked and kept a backup, while
 * overwriting everyone else's history did neither — so the destructive
 * direction was the unattended one. Merging removes the choice rather than
 * moving the guard.
 */
export async function performSync(
	handlers: SyncHandlers,
	clientId: string | null
): Promise<SyncResult> {
	const fresh = await getFreshAuth(clientId);
	if (fresh.kind === 'not-connected') {
		return { kind: 'error', message: '연결된 Google Drive 계정이 없습니다' };
	}
	if (fresh.kind === 'expired') {
		return { kind: 'error', message: '로그인이 만료되었습니다 — Drive를 다시 연결해주세요' };
	}
	const auth = fresh.auth;

	try {
		const found = await findSyncFile(auth.accessToken);
		const localSnap = await buildSyncSnapshot();

		if (!found) {
			await uploadSyncFile(auth.accessToken, null, localSnap);
			return { kind: 'no-remote-uploaded' };
		}

		const remoteRaw = await downloadSyncFile(auth.accessToken, found.id);
		const remoteSnap = remoteRaw as SyncSnapshot;

		// Both sides must actually carry a stamp before equality means anything.
		// An empty one says "this device has never recorded a mutation" — an
		// absence, not a value, and two absences are not a match. Read as one,
		// it strands a device for good: a browser holding nothing and a remote
		// holding a year both report '', the sync returns here, and no reload or
		// reconnect ever gets past it. Unknown falls through to the merge, which
		// is a union and so costs a rewrite rather than a record.
		const bothStamped = Boolean(localSnap.lastModifiedAt) && Boolean(remoteSnap.lastModifiedAt);
		if (bothStamped && localSnap.lastModifiedAt === remoteSnap.lastModifiedAt) {
			return { kind: 'remote-equal' };
		}

		const merged = mergeSnapshots(localSnap, remoteSnap);

		// Everything above this line is reads. Past it the snapshot is written
		// to every local table, so an unattended sync asks permission of
		// whatever is on screen first.
		if (handlers.beforeApply) {
			try {
				await handlers.beforeApply();
			} catch {
				return { kind: 'deferred' };
			}
		}

		// Still kept, even though the merge discards nothing: it is the only
		// way back from a bad remote file, and it costs one settings row.
		await savePreSyncBackup(localSnap);
		await applySyncSnapshot(merged);
		await uploadSyncFile(auth.accessToken, found.id, merged);
		return { kind: 'merged' };
	} catch (err) {
		return {
			kind: 'error',
			message: err instanceof Error ? err.message : String(err)
		};
	}
}
