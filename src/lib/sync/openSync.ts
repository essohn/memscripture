import { getCurrentAuth } from '$lib/cloud/google';
import { cardActivity } from '$lib/state/cardActivity';
import { performSync, type SyncResult } from './syncFlow';

/**
 * Pull whatever the other devices wrote, once, when the app opens.
 *
 * The read half of automatic sync and deliberately only that half. Syncing on
 * every change would send the whole snapshot for a single edited row — a few
 * hundred KB for a typical reader and megabytes for a heavy one, plus a full
 * local rewrite each time. Opening happens once, and once is affordable.
 *
 * Nothing here is allowed to be felt: it starts after the first paint, never
 * blocks a render, and says nothing when it fails. Opening the app offline is
 * ordinary, not an error to report.
 */

export type OpenSyncOutcome =
	| { kind: 'skipped'; why: 'not-connected' | 'offline' | 'no-client-id' | 'already-ran' }
	| { kind: 'ran'; result: SyncResult };

/** One attempt per page load. A client-side navigation is not a new open, and
 *  re-pulling on every route change would be the per-change sync this
 *  deliberately is not. */
let ran = false;

/** Only for tests, which need more than one open per process. */
export function resetOpenSync(): void {
	ran = false;
}

export interface OpenSyncDeps {
	clientId: string | null;
	online?: boolean;
	/** Injected so the guard order can be tested without a Drive account. */
	isConnected?: () => Promise<boolean>;
	sync?: typeof performSync;
	waitForIdle?: (timeoutMs?: number) => Promise<void>;
}

export async function syncOnOpen(deps: OpenSyncDeps): Promise<OpenSyncOutcome> {
	if (ran) return { kind: 'skipped', why: 'already-ran' };
	ran = true;

	const {
		clientId,
		online = typeof navigator === 'undefined' ? true : navigator.onLine,
		isConnected = async () => (await getCurrentAuth()) !== null,
		sync = performSync,
		waitForIdle = (ms?: number) => cardActivity.whenIdle(ms)
	} = deps;

	// Cheapest and commonest reason to do nothing, asked first: most readers
	// have never connected Drive, and they should cost no network and no
	// database read at launch.
	if (!clientId) return { kind: 'skipped', why: 'no-client-id' };
	if (!online) return { kind: 'skipped', why: 'offline' };
	if (!(await isConnected())) return { kind: 'skipped', why: 'not-connected' };

	// Silent by design, including on success: a toast on every launch would
	// charge the reader's attention for something they did not ask for, and
	// the records simply being there is the whole point.
	const result = await sync({ beforeApply: () => waitForIdle() }, clientId).catch(
		(err: unknown): SyncResult => ({
			kind: 'error',
			message: err instanceof Error ? err.message : String(err)
		})
	);
	return { kind: 'ran', result };
}
