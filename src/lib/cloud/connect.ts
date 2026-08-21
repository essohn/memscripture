import { authUrl, CALLBACK_PATH, challengeFor, createVerifier } from './pkce';

/**
 * Starting and finishing the consent redirect.
 *
 * A full-page redirect rather than a popup: an installed PWA on iOS has no
 * reliable popup, and the whole reason for this change is that windows
 * appearing and vanishing is what the reader was complaining about. Consent is
 * a place a redirect is expected.
 *
 * The verifier and the state are held in sessionStorage — they must survive
 * the trip to Google and back, and must not survive anything else. Session
 * storage is per-tab and cleared with it, which is exactly the lifetime a
 * one-shot login secret should have.
 */

const PENDING_KEY = 'google_oauth_pending';

export interface PendingAuth {
	verifier: string;
	state: string;
}

export function redirectUri(origin: string): string {
	return `${origin}${CALLBACK_PATH}`;
}

export function savePending(pending: PendingAuth, store: Storage): void {
	store.setItem(PENDING_KEY, JSON.stringify(pending));
}

/** Reads and clears in one step: a code is good once, and leaving the verifier
 *  behind would let a stale callback be replayed. */
export function takePending(store: Storage): PendingAuth | null {
	const raw = store.getItem(PENDING_KEY);
	store.removeItem(PENDING_KEY);
	if (!raw) return null;
	try {
		const p = JSON.parse(raw) as Partial<PendingAuth>;
		if (typeof p.verifier !== 'string' || typeof p.state !== 'string') return null;
		return { verifier: p.verifier, state: p.state };
	} catch {
		return null;
	}
}

/**
 * Whether a callback belongs to the request this tab actually made.
 *
 * Google echoes `state` back untouched, so a mismatch means the callback came
 * from somewhere else — a stale tab, a bookmarked URL, or a forged link. None
 * of those may be traded for a token.
 */
export function stateMatches(pending: PendingAuth | null, returned: string | null): boolean {
	return pending !== null && returned !== null && pending.state === returned;
}

export interface BeginOptions {
	clientId: string;
	scope: string;
	origin: string;
	store: Storage;
}

/** Builds the consent URL and remembers what the callback will need. */
export async function beginConnect(opts: BeginOptions): Promise<string> {
	const verifier = createVerifier();
	const state = createVerifier();
	savePending({ verifier, state }, opts.store);
	return authUrl({
		clientId: opts.clientId,
		redirectUri: redirectUri(opts.origin),
		scope: opts.scope,
		challenge: await challengeFor(verifier),
		state
	});
}
