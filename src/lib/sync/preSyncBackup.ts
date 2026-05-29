import { db } from '$lib/db/local';
import type { SyncSnapshot } from './snapshot';

const KEY = 'pre_sync_backup';

/** Stores the snapshot of local state we plan to overwrite. One slot;
 *  re-calling overwrites the previous backup. */
export async function savePreSyncBackup(snap: SyncSnapshot): Promise<void> {
	await db.settings.put({ key: KEY, value: snap });
}

/** Returns the stored backup, or null when nothing has been saved.
 *  Structural shape is checked at the boundary so a partially-written or
 *  hand-crafted `{ version: 1 }` blob is rejected rather than being passed
 *  to applySyncSnapshot as a half-valid snapshot. */
export async function loadPreSyncBackup(): Promise<SyncSnapshot | null> {
	const row = await db.settings.get(KEY);
	const v = row?.value;
	if (!v || typeof v !== 'object') return null;
	const s = v as Partial<SyncSnapshot>;
	if (s.version !== 1) return null;
	if (!s.oyo || typeof s.oyo !== 'object') return null;
	if (!Array.isArray(s.bookmarks)) return null;
	if (!Array.isArray(s.progress)) return null;
	if (!Array.isArray(s.activity)) return null;
	if (!Array.isArray(s.settings)) return null;
	return v as SyncSnapshot;
}

/** Removes the stored backup (e.g. after a successful "undo").
 *  Idempotent — calling with no backup present is a no-op. */
export async function clearPreSyncBackup(): Promise<void> {
	await db.settings.delete(KEY);
}
