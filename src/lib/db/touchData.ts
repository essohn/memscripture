import { db } from './local';

const KEY = 'data_last_modified_at';

/** Stamps the current ISO timestamp as the local last-write marker.
 *  Read by the sync orchestrator to decide between local and remote
 *  in last-writer-wins. Called from every user-mutating Dexie path. */
export async function touchDataModified(): Promise<void> {
	await db.settings.put({ key: KEY, value: new Date().toISOString() });
}

/** Returns the most recent local last-write timestamp, or null when the
 *  user has never made a mutation on this device. */
export async function getDataLastModified(): Promise<string | null> {
	const row = await db.settings.get(KEY);
	const v = row?.value;
	return typeof v === 'string' ? v : null;
}
