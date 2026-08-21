/**
 * The authorization-code half of Google sign-in.
 *
 * The app used to take access tokens straight from GIS, which is the implicit
 * flow: no refresh token, so every hour the only way to get another was to ask
 * GIS again — and GIS asks by opening a popup window. A window appearing on
 * launch, tied to nothing the reader did, is what this replaces.
 *
 * The code flow yields a refresh token, and refreshing one is an ordinary
 * fetch. It needs a client secret, which cannot live in a browser, so the
 * exchange happens in this app's Cloudflare Worker — see
 * routes/api/google/*. PKCE is used anyway: the code travels through a
 * redirect the browser can see, and the verifier is what stops a code
 * intercepted there from being worth anything.
 */

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const CALLBACK_PATH = '/auth/google/callback';

/** Unreserved characters only, so the verifier survives a URL untouched. */
const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** RFC 7636 allows 43–128; 64 is comfortably inside and gives 384 bits. */
export function createVerifier(random: (n: number) => Uint8Array = randomBytes): string {
	const bytes = random(64);
	let out = '';
	for (const b of bytes) out += VERIFIER_ALPHABET[b % VERIFIER_ALPHABET.length];
	return out;
}

function randomBytes(n: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(n));
}

/** base64url: the plain alphabet with two substitutions and no padding. */
export function base64Url(bytes: ArrayBuffer): string {
	let binary = '';
	for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64Url(digest);
}

export interface AuthUrlParams {
	clientId: string;
	redirectUri: string;
	scope: string;
	challenge: string;
	state: string;
}

/**
 * Where to send the browser to ask for consent.
 *
 * `access_type=offline` is what asks for a refresh token at all, and
 * `prompt=consent` is what makes Google actually send one: without it, a user
 * who has already consented gets an access token and nothing else, and the
 * whole point of the change is quietly lost on exactly the people who had
 * connected before.
 */
export function authUrl(p: AuthUrlParams): string {
	const q = new URLSearchParams({
		client_id: p.clientId,
		redirect_uri: p.redirectUri,
		response_type: 'code',
		scope: p.scope,
		code_challenge: p.challenge,
		code_challenge_method: 'S256',
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state: p.state
	});
	return `${AUTH_ENDPOINT}?${q.toString()}`;
}

export interface TokenBundle {
	accessToken: string;
	/** Absent when Google declines to issue one — see `authUrl`. */
	refreshToken: string | null;
	/** epoch ms */
	expiresAt: number;
}

/**
 * Reads a token response, whether it came from the first exchange or a
 * refresh. A refresh reply carries no refresh_token: the existing one stays
 * valid and must not be overwritten with nothing.
 */
export function readTokenResponse(body: unknown, now = Date.now()): TokenBundle | null {
	if (!body || typeof body !== 'object') return null;
	const b = body as Record<string, unknown>;
	if (typeof b.access_token !== 'string' || b.access_token.length === 0) return null;
	const lifetime = typeof b.expires_in === 'number' ? b.expires_in : 3600;
	return {
		accessToken: b.access_token,
		refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
		expiresAt: now + lifetime * 1000
	};
}
