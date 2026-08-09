import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	connectGoogleDrive,
	disconnectGoogleDrive,
	getCurrentAuth
} from '../../src/lib/cloud/google';

beforeEach(async () => {
	await db.delete();
	await db.open();
	vi.stubGlobal('document', {
		createElement: () => ({ set src(v: string) {}, onload: null }),
		head: { appendChild: vi.fn() }
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

interface CapturedConfig {
	scope: string;
	callback: (resp: unknown) => void;
}

/** Mirrors the real GIS shape: the callback is supplied in initTokenClient's
 *  config and the resulting client.requestAccessToken triggers it. Stubbing
 *  `window.google` also skips the script-tag injection branch. Returns the
 *  array of configs the code under test passed in, so tests can assert on
 *  what was actually requested. */
function stubGis(): CapturedConfig[] {
	const configs: CapturedConfig[] = [];
	const fakeTokenClient = {
		requestAccessToken: vi.fn(() => {
			const cfg = configs.at(-1);
			// Echo the requested scope back as the granted scope, the way a
			// full-consent grant does.
			cfg?.callback({ access_token: 'tok', expires_in: 3600, scope: cfg.scope });
		})
	};
	vi.stubGlobal('window', {
		google: {
			accounts: {
				oauth2: {
					initTokenClient: vi.fn((config: CapturedConfig) => {
						configs.push(config);
						return fakeTokenClient;
					})
				}
			}
		}
	});
	return configs;
}

describe('google auth state', () => {
	it('getCurrentAuth returns null when not connected', async () => {
		expect(await getCurrentAuth()).toBeNull();
	});

	// Regression guard: the UserInfo endpoint serves OpenID claims and rejects a
	// token scoped only to drive.file, so connect would 401 before ever touching
	// Drive. Asserting the request — not just mocking a happy response — is what
	// catches a re-narrowed scope.
	it('requests an identity scope alongside drive.file', async () => {
		const configs = stubGis();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: 'user@example.com' }) })
		);

		await connectGoogleDrive('client-id');

		const requested = configs[0].scope.split(/\s+/);
		expect(requested).toContain('https://www.googleapis.com/auth/drive.file');
		expect(requested).toContain('https://www.googleapis.com/auth/userinfo.email');
	});

	it('rejects — and stores nothing — when userinfo fails', async () => {
		stubGis();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

		await expect(connectGoogleDrive('client-id')).rejects.toThrow(/userinfo failed: HTTP 401/);
		// A half-built auth row would leave the UI claiming a connection that
		// can't sync, so nothing may be persisted on this path.
		expect(await getCurrentAuth()).toBeNull();
	});

	it('connect → persist → getCurrentAuth returns the row', async () => {
		stubGis();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ email: 'user@example.com' })
			})
		);

		const auth = await connectGoogleDrive('client-id');
		expect(auth.email).toBe('user@example.com');
		expect(auth.accessToken).toBe('tok');
		expect(auth.expiresAt).toBeGreaterThan(Date.now());

		const stored = await getCurrentAuth();
		expect(stored?.email).toBe('user@example.com');
	});

	it('disconnect clears the stored auth', async () => {
		await db.settings.put({
			key: 'google_drive_auth',
			value: { email: 'x@y.com', accessToken: 't', expiresAt: Date.now() + 1000 }
		});
		await disconnectGoogleDrive();
		expect(await getCurrentAuth()).toBeNull();
	});
});
