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

describe('google auth state', () => {
	it('getCurrentAuth returns null when not connected', async () => {
		expect(await getCurrentAuth()).toBeNull();
	});

	it('connect → persist → getCurrentAuth returns the row', async () => {
		// Mirror the real GIS shape: callback is supplied in initTokenClient's
		// config and the resulting client.requestAccessToken triggers it.
		let onTokenCallback: ((resp: unknown) => void) | undefined;
		const fakeTokenClient = {
			requestAccessToken: vi.fn(() => {
				onTokenCallback?.({
					access_token: 'tok',
					expires_in: 3600,
					scope: 'https://www.googleapis.com/auth/drive.file'
				});
			})
		};
		vi.stubGlobal('window', {
			google: {
				accounts: {
					oauth2: {
						initTokenClient: vi.fn(
							(config: { callback: (resp: unknown) => void }) => {
								onTokenCallback = config.callback;
								return fakeTokenClient;
							}
						)
					}
				}
			}
		});
		// Skip the script-tag injection branch entirely by pretending the
		// google object already exists.

		// fetch the userinfo email
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
