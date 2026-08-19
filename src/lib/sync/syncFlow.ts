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
	| { kind: 'error'; message: string };

export interface SyncHandlers {
	/** Kept for callers that still pass one. Nothing asks any more: a merge
	 *  discards nothing, so there is no longer a question to put to the user. */
	confirmOverwrite?: () => Promise<boolean>;
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

		if (localSnap.lastModifiedAt === remoteSnap.lastModifiedAt) return { kind: 'remote-equal' };

		const merged = mergeSnapshots(localSnap, remoteSnap);
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
