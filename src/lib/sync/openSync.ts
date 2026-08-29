import { getCurrentAuth } from '$lib/cloud/google';
import { tokenUsable } from '$lib/cloud/session';
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
	| {
			kind: 'skipped';
			why: 'not-connected' | 'offline' | 'no-client-id' | 'already-ran' | 'needs-login';
	  }
	| { kind: 'ran'; result: SyncResult };

/**
 * Whether an open-sync outcome brought another device's records onto this one.
 *
 * The only question the layout asks of the outcome. A merge is the one branch
 * that rewrites the local tables, so it is the one branch that leaves a
 * mounted screen showing rows that no longer exist — and the only one worth
 * refreshing for or saying anything about. Uploading, finding nothing new,
 * deferring and failing all leave this device exactly as the reader left it.
 */
export function pulledRemoteRecords(outcome: OpenSyncOutcome): boolean {
	return outcome.kind === 'ran' && outcome.result.kind === 'merged';
}

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
	/** Injected so the guard order can be tested without a Drive account.
	 *  Returns the stored auth, or null when Drive was never connected. */
	storedAuth?: () => Promise<{ expiresAt: number; refreshToken?: string } | null>;
	sync?: typeof performSync;
	waitForIdle?: (timeoutMs?: number) => Promise<void>;
}

export async function syncOnOpen(deps: OpenSyncDeps): Promise<OpenSyncOutcome> {
	if (ran) return { kind: 'skipped', why: 'already-ran' };
	ran = true;

	const {
		clientId,
		online = typeof navigator === 'undefined' ? true : navigator.onLine,
		storedAuth = getCurrentAuth,
		sync = performSync,
		waitForIdle = (ms?: number) => cardActivity.whenIdle(ms)
	} = deps;

	// Cheapest and commonest reason to do nothing, asked first: most readers
	// have never connected Drive, and they should cost no network and no
	// database read at launch.
	if (!clientId) return { kind: 'skipped', why: 'no-client-id' };
	if (!online) return { kind: 'skipped', why: 'offline' };

	const auth = await storedAuth();
	if (!auth) return { kind: 'skipped', why: 'not-connected' };
	// A spent token is fine when there is a refresh token to renew it with:
	// that path is a fetch to this app's own Worker and nothing appears on
	// screen. Without one, renewing means GIS opening a popup window — which
	// flashes on launch for no reason the reader can connect to anything they
	// did. Those wait for the sync button, which is attended and where a popup
	// is expected. Nothing unattended may summon one.
	if (!tokenUsable(auth) && !auth.refreshToken) {
		return { kind: 'skipped', why: 'needs-login' };
	}

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
