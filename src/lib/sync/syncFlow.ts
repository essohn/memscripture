import { getCurrentAuth } from '$lib/cloud/google';
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

export type SyncResult =
	| { kind: 'no-remote-uploaded' }
	| { kind: 'remote-equal' }
	| { kind: 'local-newer-uploaded' }
	| { kind: 'remote-newer-imported' }
	| { kind: 'remote-newer-declined' }
	| { kind: 'error'; message: string };

export interface SyncHandlers {
	/** Resolves with true when the user agreed to overwrite local state. */
	confirmOverwrite: () => Promise<boolean>;
}

/** Single-button sync orchestrator. Decision tree:
 *  - not authenticated → error
 *  - no remote file    → upload local (create)
 *  - timestamps equal  → no-op
 *  - local newer       → upload local (PATCH)
 *  - remote newer      → confirm → save backup + apply remote (or decline) */
export async function performSync(handlers: SyncHandlers): Promise<SyncResult> {
	const auth = await getCurrentAuth();
	if (!auth) return { kind: 'error', message: '연결된 Google Drive 계정이 없습니다' };

	try {
		const found = await findSyncFile(auth.accessToken);
		const localSnap = await buildSyncSnapshot();

		if (!found) {
			await uploadSyncFile(auth.accessToken, null, localSnap);
			return { kind: 'no-remote-uploaded' };
		}

		const remoteRaw = await downloadSyncFile(auth.accessToken, found.id);
		const remoteSnap = remoteRaw as SyncSnapshot;
		const localTs = localSnap.lastModifiedAt;
		// Fallback for a remote envelope missing lastModifiedAt (legacy or
		// hand-edited): treat as the lexicographic minimum so any real local
		// ISO timestamp wins and uploads. ISO-8601 strings compare correctly
		// in normal lexicographic order.
		const remoteTs = remoteSnap.lastModifiedAt ?? '';

		if (localTs === remoteTs) return { kind: 'remote-equal' };
		if (localTs > remoteTs) {
			await uploadSyncFile(auth.accessToken, found.id, localSnap);
			return { kind: 'local-newer-uploaded' };
		}

		// remote > local
		const ok = await handlers.confirmOverwrite();
		if (!ok) return { kind: 'remote-newer-declined' };
		await savePreSyncBackup(localSnap);
		await applySyncSnapshot(remoteSnap);
		return { kind: 'remote-newer-imported' };
	} catch (err) {
		return {
			kind: 'error',
			message: err instanceof Error ? err.message : String(err)
		};
	}
}
