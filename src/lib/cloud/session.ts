import { getCurrentAuth, refreshAccessToken, type GoogleAuthState } from './google';

/** Refresh this far ahead of the stated expiry, so a call that starts just
 *  under the wire can't have its token die mid-flight between two requests.
 *  Google access tokens last an hour. */
export const EXPIRY_MARGIN_MS = 5 * 60_000;

/**
 * Whether the stored token can be used as it stands.
 *
 * Public because refreshing is not free: GIS gets a new token by opening a
 * popup window, which flashes on screen even when it completes without asking
 * anything. That is fine when someone pressed a button and is watching, and
 * not fine on launch — so an unattended caller checks this first and does
 * nothing rather than making a window appear out of nowhere.
 */
export function tokenUsable(auth: { expiresAt: number }, now = Date.now()): boolean {
	return auth.expiresAt - now > EXPIRY_MARGIN_MS;
}

export type FreshAuth =
	| { kind: 'ok'; auth: GoogleAuthState }
	/** Never connected, or disconnected in Settings. */
	| { kind: 'not-connected' }
	/** Connected once, but the silent refresh failed — the user has to
	 *  re-consent. Distinct from not-connected because the two need different
	 *  things said to the reader. */
	| { kind: 'expired' };

/**
 * Returns an auth whose token is good for the next few minutes, refreshing
 * silently when the stored one is spent.
 *
 * Lives here rather than inside the sync orchestrator because the Sheets
 * export needs exactly the same three-way answer, and a second copy of the
 * expiry arithmetic is how the two would drift apart.
 *
 * clientId is passed in rather than read from $env: that module resolves only
 * inside a SvelteKit build, and taking it as an argument keeps this testable —
 * the same reason cloud/google.ts takes it too.
 */
export async function getFreshAuth(clientId: string | null): Promise<FreshAuth> {
	const stored = await getCurrentAuth();
	if (!stored) return { kind: 'not-connected' };
	if (tokenUsable(stored)) return { kind: 'ok', auth: stored };
	if (!clientId) return { kind: 'expired' };
	const refreshed = await refreshAccessToken(clientId, stored.email).catch(() => null);
	return refreshed ? { kind: 'ok', auth: refreshed } : { kind: 'expired' };
}
