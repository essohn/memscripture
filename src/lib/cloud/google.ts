import { db } from '$lib/db/local';

const AUTH_KEY = 'google_drive_auth';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface GoogleAuthState {
	email: string;
	accessToken: string;
	/** epoch ms — when the access token expires */
	expiresAt: number;
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
			scope: DRIVE_SCOPE,
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

/** Re-runs GIS silent prompt to refresh an access token. Returns the new
 *  state or throws on failure. */
export async function refreshAccessToken(
	clientId: string,
	currentEmail: string
): Promise<GoogleAuthState> {
	await loadGisClient();
	const tokenResponse = await new Promise<TokenResponse>((resolve) => {
		const client = gisOauth2().initTokenClient({
			client_id: clientId,
			scope: DRIVE_SCOPE,
			hint: currentEmail,
			callback: (response) => resolve(response)
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
