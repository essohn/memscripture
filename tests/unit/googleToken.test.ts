import { describe, expect, it, vi } from 'vitest';
import { exchangeCode, refreshToken } from '../../src/lib/server/googleToken';

const CFG = { clientId: 'cid', clientSecret: 'sh!' };
const ok = (body: unknown) =>
	vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);

describe('exchangeCode', () => {
	it('posts the code, the verifier and the secret as a form', async () => {
		const f = ok({ access_token: 'at' });
		await exchangeCode(CFG, 'the-code', 'the-verifier', 'https://x/cb', f as never);
		const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(url).toBe('https://oauth2.googleapis.com/token');
		const sent = new URLSearchParams(init.body as string);
		expect(sent.get('grant_type')).toBe('authorization_code');
		expect(sent.get('code')).toBe('the-code');
		expect(sent.get('code_verifier')).toBe('the-verifier');
		expect(sent.get('client_secret')).toBe('sh!');
	});

	// An id_token carries profile claims nothing here reads. Narrowing means a
	// future addition to Google's response cannot start reaching the browser.
	it('relays only the token fields', async () => {
		const f = ok({
			access_token: 'at',
			refresh_token: 'rt',
			expires_in: 3600,
			token_type: 'Bearer',
			id_token: 'jwt.with.claims',
			scope: 'a b'
		});
		const res = await exchangeCode(CFG, 'c', 'v', 'https://x/cb', f as never);
		expect(res.body).toEqual({
			access_token: 'at',
			refresh_token: 'rt',
			expires_in: 3600,
			token_type: 'Bearer'
		});
	});

	// Google's failure bodies quote the request back, including the grant and
	// the client. Relaying one would put the secret's own error text in front
	// of a browser.
	it('flattens a failure instead of echoing Google', async () => {
		const f = vi.fn(async () => ({
			ok: false,
			status: 400,
			json: async () => ({ error: 'invalid_grant', error_description: 'client_secret sh! bad' })
		}) as unknown as Response);
		const res = await exchangeCode(CFG, 'c', 'v', 'https://x/cb', f as never);
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'token_exchange_failed' });
		expect(JSON.stringify(res.body)).not.toContain('sh!');
	});

	it('survives a body that is not JSON', async () => {
		const f = vi.fn(async () => ({
			ok: false, status: 500, json: async () => { throw new Error('html'); }
		}) as unknown as Response);
		await expect(exchangeCode(CFG, 'c', 'v', 'https://x/cb', f as never)).resolves.toMatchObject({
			status: 500
		});
	});
});

describe('refreshToken', () => {
	it('posts the refresh grant', async () => {
		const f = ok({ access_token: 'at2', expires_in: 3600 });
		await refreshToken(CFG, 'rt', f as never);
		const sent = new URLSearchParams(
			(f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
		);
		expect(sent.get('grant_type')).toBe('refresh_token');
		expect(sent.get('refresh_token')).toBe('rt');
	});

	// A refresh reply legitimately has no refresh_token; the caller keeps the
	// one it already holds.
	it('relays a reply that carries no new refresh token', async () => {
		const f = ok({ access_token: 'at2', expires_in: 3600, token_type: 'Bearer' });
		const res = await refreshToken(CFG, 'rt', f as never);
		expect(res.body).toEqual({ access_token: 'at2', expires_in: 3600, token_type: 'Bearer' });
	});
});
