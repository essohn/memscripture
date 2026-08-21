import { describe, expect, it, vi } from 'vitest';
import { beginConnect, redirectUri, savePending, stateMatches, takePending } from '../../src/lib/cloud/connect';

function memoryStore(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
		removeItem: (k) => void map.delete(k),
		clear: () => map.clear(),
		key: () => null,
		get length() { return map.size; }
	} as Storage;
}

describe('redirectUri', () => {
	it('is the callback route on this origin', () => {
		expect(redirectUri('https://mem.lifescripture.org')).toBe(
			'https://mem.lifescripture.org/auth/google/callback'
		);
	});
});

describe('pending auth', () => {
	// A code is good once. Leaving the verifier behind would let a stale
	// callback — a bookmarked URL, a back button — be replayed against it.
	it('is read and cleared in one step', () => {
		const store = memoryStore();
		savePending({ verifier: 'v', state: 's' }, store);
		expect(takePending(store)).toEqual({ verifier: 'v', state: 's' });
		expect(takePending(store)).toBeNull();
	});

	it('is null when nothing was started', () => {
		expect(takePending(memoryStore())).toBeNull();
	});

	it.each([['not json'], ['{"verifier":"v"}'], ['{"state":"s"}'], ['null']])(
		'refuses malformed stored value %s',
		(raw) => {
			const store = memoryStore();
			store.setItem('google_oauth_pending', raw);
			expect(takePending(store)).toBeNull();
		}
	);
});

describe('stateMatches', () => {
	// Google echoes state untouched, so a mismatch means the callback came
	// from somewhere other than the consent this tab started.
	it('accepts only the state this tab sent', () => {
		const pending = { verifier: 'v', state: 'abc' };
		expect(stateMatches(pending, 'abc')).toBe(true);
		expect(stateMatches(pending, 'other')).toBe(false);
	});

	it('refuses when either side is missing', () => {
		expect(stateMatches(null, 'abc')).toBe(false);
		expect(stateMatches({ verifier: 'v', state: 'abc' }, null)).toBe(false);
	});
});

describe('beginConnect', () => {
	it('remembers what the callback will need, and asks for a code', async () => {
		const store = memoryStore();
		const url = new URL(
			await beginConnect({ clientId: 'cid', scope: 'a b', origin: 'https://x.test', store })
		);
		const pending = takePending(store);
		expect(pending).not.toBeNull();
		expect(url.searchParams.get('state')).toBe(pending!.state);
		expect(url.searchParams.get('redirect_uri')).toBe('https://x.test/auth/google/callback');
		expect(url.searchParams.get('response_type')).toBe('code');
	});

	// The verifier is the one thing that must never travel with the request —
	// only its digest does.
	it('sends the challenge, never the verifier', async () => {
		const store = memoryStore();
		const url = await beginConnect({ clientId: 'cid', scope: 'a', origin: 'https://x.test', store });
		const pending = takePending(store)!;
		expect(url).not.toContain(pending.verifier);
		expect(new URL(url).searchParams.get('code_challenge')).toBeTruthy();
	});

	it('starts a different request each time', async () => {
		const a = memoryStore(), b = memoryStore();
		await beginConnect({ clientId: 'c', scope: 's', origin: 'https://x.test', store: a });
		await beginConnect({ clientId: 'c', scope: 's', origin: 'https://x.test', store: b });
		expect(takePending(a)!.state).not.toBe(takePending(b)!.state);
	});
});
