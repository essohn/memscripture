import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/lib/db/local';
import {
	connectGoogleDrive,
	disconnectGoogleDrive,
	getCurrentAuth,
	refreshAccessToken
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

	// Regression guard for the three scopes the flow actually needs. Each has a
	// distinct failure mode that a mocked-happy-response test cannot see:
	//   drive.appdata    — drive.ts reads/writes the appDataFolder space, which
	//                      drive.file does not reach; every Drive call 403s.
	//   userinfo.email   — the UserInfo endpoint serves OpenID claims and rejects
	//                      a token with no identity scope; connect 401s.
	//   drive.file       — the file operations themselves.
	// Asserting the request, not the response, is what catches a re-narrowed set.
	it('requests every scope the sync flow depends on', async () => {
		const configs = stubGis();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: 'user@example.com' }) })
		);

		await connectGoogleDrive('client-id');

		const requested = configs[0].scope.split(/\s+/);
		expect(requested).toContain('https://www.googleapis.com/auth/drive.file');
		expect(requested).toContain('https://www.googleapis.com/auth/drive.appdata');
		expect(requested).toContain('https://www.googleapis.com/auth/userinfo.email');
	});

	// A refresh asking for a different set than connect turns Google's silent
	// prompt into an incremental-consent popup, which breaks unattended sync.
	it('refresh requests the identical scope set as connect', async () => {
		const configs = stubGis();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: 'user@example.com' }) })
		);

		await connectGoogleDrive('client-id');
		await refreshAccessToken('client-id', 'user@example.com');

		expect(configs).toHaveLength(2);
		expect(configs[1].scope).toBe(configs[0].scope);
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
