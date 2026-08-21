import { describe, expect, it } from 'vitest';
import {
	authUrl,
	base64Url,
	challengeFor,
	createVerifier,
	readTokenResponse
} from '../../src/lib/cloud/pkce';

describe('createVerifier', () => {
	// RFC 7636 allows 43–128 unreserved characters; anything outside that
	// alphabet has to be escaped in a URL and stops matching on the way back.
	it('is URL-safe and inside the legal length', () => {
		const v = createVerifier();
		expect(v.length).toBeGreaterThanOrEqual(43);
		expect(v.length).toBeLessThanOrEqual(128);
		expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
		expect(encodeURIComponent(v)).toBe(v);
	});

	it('does not repeat itself', () => {
		expect(createVerifier()).not.toBe(createVerifier());
	});
});

describe('base64Url', () => {
	// The plain alphabet with two substitutions and no padding — `+`, `/` and
	// `=` all mean something else inside a URL.
	it('emits nothing a URL would reinterpret', () => {
		const bytes = new Uint8Array(Array.from({ length: 64 }, (_, i) => i * 3));
		const out = base64Url(bytes.buffer);
		expect(out).not.toMatch(/[+/=]/);
		expect(out).toMatch(/^[A-Za-z0-9\-_]+$/);
	});
});

describe('challengeFor', () => {
	// The one value in the flow that must match Google's own computation; a
	// wrong digest fails only at the exchange, long after the redirect.
	it('is the S256 digest, base64url encoded', async () => {
		// RFC 7636 appendix B's worked example.
		const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
		expect(await challengeFor(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	});

	it('is stable for the same verifier', async () => {
		const v = createVerifier();
		expect(await challengeFor(v)).toBe(await challengeFor(v));
	});
});

describe('authUrl', () => {
	const base = {
		clientId: 'cid',
		redirectUri: 'https://mem.lifescripture.org/auth/google/callback',
		scope: 'a b',
		challenge: 'chal',
		state: 'st'
	};

	// Without these two Google issues an access token and no refresh token —
	// and the whole change quietly does nothing for the people who had already
	// consented, which is everyone who was affected.
	it('asks for a refresh token, and insists on one', () => {
		const u = new URL(authUrl(base));
		expect(u.searchParams.get('access_type')).toBe('offline');
		expect(u.searchParams.get('prompt')).toBe('consent');
	});

	it('requests a code, bound to the PKCE challenge', () => {
		const u = new URL(authUrl(base));
		expect(u.searchParams.get('response_type')).toBe('code');
		expect(u.searchParams.get('code_challenge')).toBe('chal');
		expect(u.searchParams.get('code_challenge_method')).toBe('S256');
	});

	it('carries the redirect and state back', () => {
		const u = new URL(authUrl(base));
		expect(u.searchParams.get('redirect_uri')).toBe(base.redirectUri);
		expect(u.searchParams.get('state')).toBe('st');
	});

	// The secret never belongs anywhere a browser can see, and this URL is the
	// most visible thing in the flow.
	it('carries no secret', () => {
		expect(authUrl(base)).not.toMatch(/secret/i);
	});
});

describe('readTokenResponse', () => {
	const now = 1_700_000_000_000;

	it('reads an exchange reply', () => {
		expect(
			readTokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }, now)
		).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: now + 3_600_000 });
	});

	// A refresh reply has no refresh_token: the existing one stays valid, and
	// the caller must not overwrite it with nothing.
	it('reports no refresh token when the reply carries none', () => {
		expect(readTokenResponse({ access_token: 'at', expires_in: 3600 }, now)?.refreshToken).toBeNull();
	});

	it('assumes the standard hour when no lifetime is given', () => {
		expect(readTokenResponse({ access_token: 'at' }, now)?.expiresAt).toBe(now + 3_600_000);
	});

	it.each([[null], [undefined], ['nope'], [{}], [{ access_token: '' }], [{ access_token: 7 }]])(
		'rejects %o',
		(body) => {
			expect(readTokenResponse(body, now)).toBeNull();
		}
	);
});
