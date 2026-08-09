import { getCurrentAuth, refreshAccessToken, type GoogleAuthState } from '$lib/cloud/google';
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

/** Refresh this far ahead of the stated expiry, so a sync that starts just
 *  under the wire can't have its token die mid-flight between the find and
 *  the upload. Google access tokens last an hour. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

/** Returns an auth whose token is good for the next few minutes, refreshing
 *  silently when the stored one is spent. Returns null when the refresh fails,
 *  which means the user has to re-consent — a stale token would otherwise 401
 *  on every Drive call with no path back except disconnect/reconnect.
 *
 *  clientId is passed in rather than read from $env here: that module resolves
 *  only inside a SvelteKit build, and taking it as an argument keeps this
 *  orchestrator testable — the same reason cloud/google.ts takes it too. */
async function withFreshToken(
	auth: GoogleAuthState,
	clientId: string | null
): Promise<GoogleAuthState | null> {
	if (auth.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return auth;
	if (!clientId) return null;
	return refreshAccessToken(clientId, auth.email).catch(() => null);
}

/** Single-button sync orchestrator. Decision tree:
 *  - not authenticated → error
 *  - no remote file    → upload local (create)
 *  - timestamps equal  → no-op
 *  - local newer       → upload local (PATCH)
 *  - remote newer      → confirm → save backup + apply remote (or decline) */
export async function performSync(
	handlers: SyncHandlers,
	clientId: string | null
): Promise<SyncResult> {
	const stored = await getCurrentAuth();
	if (!stored) return { kind: 'error', message: '연결된 Google Drive 계정이 없습니다' };

	const auth = await withFreshToken(stored, clientId);
	if (!auth) {
		return { kind: 'error', message: '로그인이 만료되었습니다 — Drive를 다시 연결해주세요' };
	}

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
