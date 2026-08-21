import { db } from '$lib/db/local';
import { readTokenResponse } from './pkce';

const AUTH_KEY = 'google_drive_auth';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** The UserInfo endpoint below rejects a token scoped only to drive.file — it
 *  serves OpenID claims and needs an identity scope. Without this the very
 *  first connect fails at the userinfo fetch, before any Drive call. Both
 *  scopes are non-sensitive, so neither triggers Google app verification. */
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
/** drive.ts stores the sync file in the appDataFolder space, which drive.file
 *  does not reach — that space needs its own scope, or every Drive call 403s.
 *  Also non-sensitive, so it adds no verification burden. */
const APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
/** Space-delimited, per the OAuth 2.0 scope syntax GIS expects. Must be
 *  identical in connect and refresh — asking for a different set on refresh
 *  turns the silent prompt into an incremental-consent popup. */
export const AUTH_SCOPES = `${DRIVE_SCOPE} ${APPDATA_SCOPE} ${EMAIL_SCOPE}`;
/** A silent refresh that needs user interaction never invokes the callback,
 *  which would hang performSync — and with it the sync button — forever.
 *  Bound the wait so the caller gets a failure it can report instead. */
const REFRESH_TIMEOUT_MS = 15_000;
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface GoogleAuthState {
	email: string;
	accessToken: string;
	/** epoch ms — when the access token expires */
	expiresAt: number;
	/**
	 * Long-lived, and what makes a refresh an ordinary fetch instead of a
	 * popup. Absent for anyone who connected under the old GIS flow; they keep
	 * working through that path until they reconnect.
	 *
	 * Device-local like the rest of this row — `google_drive_auth` is in
	 * DEVICE_LOCAL_KEYS, so it is stripped from the sync snapshot and never
	 * leaves the device it was issued to.
	 */
	refreshToken?: string;
}

/** Injects the GIS script tag exactly once. Resolves after onload, or
 *  immediately when window.google.accounts is already present (e.g. in
 *  unit tests that pre-stub the global). */
async function loadGisClient(): Promise<void> {
	if (typeof window === 'undefined') return;
	const g = (window as unknown as { google?: { accounts?: unknown } }).google;
	if (g?.accounts) return;
	await new Promise<void>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = GIS_SRC;
		s.async = true;
		s.defer = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('failed to load Google Identity Services'));
		document.head.appendChild(s);
	});
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	scope: string;
}

interface TokenClientConfig {
	client_id: string;
	scope: string;
	hint?: string;
	callback: (response: TokenResponse) => void;
}

interface GisOauth2 {
	initTokenClient: (config: TokenClientConfig) => {
		requestAccessToken: (opts?: { prompt?: string }) => void;
	};
}

/** Narrow accessor for the GIS oauth2 namespace. The casts are localized so
 *  the rest of the module only sees the typed `GisOauth2`. */
function gisOauth2(): GisOauth2 {
	return (window as unknown as { google: { accounts: { oauth2: GisOauth2 } } }).google.accounts
		.oauth2;
}

/** Opens the GIS consent flow and returns / persists the resulting auth
 *  state. Fetches the user email via the userinfo endpoint so the UI can
 *  render which account is connected. */
export async function connectGoogleDrive(clientId: string): Promise<GoogleAuthState> {
	await loadGisClient();
	const tokenResponse = await new Promise<TokenResponse>((resolve) => {
		const client = gisOauth2().initTokenClient({
			client_id: clientId,
			scope: AUTH_SCOPES,
			callback: (response) => resolve(response)
		});
		client.requestAccessToken({ prompt: 'consent' });
	});

	const userRes = await fetch(USERINFO_URL, {
		headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
	});
	if (!userRes.ok) throw new Error(`userinfo failed: HTTP ${userRes.status}`);
	const userinfo = (await userRes.json()) as { email: string };

	const auth: GoogleAuthState = {
		email: userinfo.email,
		accessToken: tokenResponse.access_token,
		expiresAt: Date.now() + tokenResponse.expires_in * 1000
	};
	await db.settings.put({ key: AUTH_KEY, value: auth });
	return auth;
}

/** Returns the stored auth, or null when never connected / disconnected.
 *  Does NOT check token expiry — callers must compare `expiresAt` against
 *  `Date.now()` and refresh before using a stale token. */
export async function getCurrentAuth(): Promise<GoogleAuthState | null> {
	const row = await db.settings.get(AUTH_KEY);
	const v = row?.value;
	if (!v || typeof v !== 'object') return null;
	const a = v as Partial<GoogleAuthState>;
	if (
		typeof a.email !== 'string' ||
		typeof a.accessToken !== 'string' ||
		!Number.isFinite(a.expiresAt) ||
		(a.expiresAt as number) <= 0
	) {
		return null;
	}
	return a as GoogleAuthState;
}

/** Persists an auth row. Exported so the code-flow callback can write one
 *  without duplicating the key or the shape. */
export async function storeAuth(auth: GoogleAuthState): Promise<void> {
	await db.settings.put({ key: AUTH_KEY, value: auth });
}

/**
 * Trades the stored refresh token for a new access token, through this app's
 * own Worker — an ordinary fetch, with no window and no GIS.
 *
 * A refresh reply carries no refresh_token of its own: the existing one stays
 * valid, and writing `undefined` over it would cost the reader the very thing
 * that keeps them signed in.
 */
async function refreshViaWorker(auth: GoogleAuthState): Promise<GoogleAuthState | null> {
	if (!auth.refreshToken) return null;
	const res = await fetch('/api/google/refresh', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refresh_token: auth.refreshToken })
	});
	if (!res.ok) return null;
	const bundle = readTokenResponse(await res.json().catch(() => null));
	if (!bundle) return null;
	const next: GoogleAuthState = {
		...auth,
		accessToken: bundle.accessToken,
		expiresAt: bundle.expiresAt,
		refreshToken: bundle.refreshToken ?? auth.refreshToken
	};
	await storeAuth(next);
	return next;
}

/**
 * Refreshes an access token.
 *
 * Prefers the refresh token, which is silent. Falls back to the GIS prompt for
 * anyone still on the old flow — that one opens a popup, which is why callers
 * that run unattended check `tokenUsable` first and decline to come here.
 */
export async function refreshAccessToken(
	clientId: string,
	currentEmail: string
): Promise<GoogleAuthState> {
	const stored = await getCurrentAuth();
	if (stored?.refreshToken) {
		const refreshed = await refreshViaWorker(stored);
		if (refreshed) return refreshed;
		// Fall through: a refresh token can be revoked, and the GIS prompt is
		// then the only way back without making the reader hunt for Settings.
	}
	await loadGisClient();
	const tokenResponse = await new Promise<TokenResponse>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error('silent token refresh timed out')),
			REFRESH_TIMEOUT_MS
		);
		const client = gisOauth2().initTokenClient({
			client_id: clientId,
			scope: AUTH_SCOPES,
			hint: currentEmail,
			callback: (response) => {
				clearTimeout(timer);
				resolve(response);
			}
		});
		client.requestAccessToken({ prompt: '' });
	});
	const auth: GoogleAuthState = {
		email: currentEmail,
		accessToken: tokenResponse.access_token,
		expiresAt: Date.now() + tokenResponse.expires_in * 1000
	};
	await db.settings.put({ key: AUTH_KEY, value: auth });
	return auth;
}

/** Clears the stored token. Does not revoke the consent — the user can
 *  re-connect immediately without re-consenting. */
export async function disconnectGoogleDrive(): Promise<void> {
	await db.settings.delete(AUTH_KEY);
}
