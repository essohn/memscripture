import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOpenSync, syncOnOpen } from '../../src/lib/sync/openSync';
import { cardActivity } from '../../src/lib/state/cardActivity';

/** A stored auth with an hour still on its token. */
const connected = async () => ({ expiresAt: Date.now() + 3_600_000 });
const ok = vi.fn(async () => ({ kind: 'merged' }) as never);

beforeEach(() => {
	resetOpenSync();
	ok.mockClear();
});

describe('syncOnOpen guards', () => {
	// The commonest case by far: most readers never connect Drive, and they
	// should cost no network and no database read at launch.
	it('does nothing without a client id, without even asking the database', async () => {
		const storedAuth = vi.fn(connected);
		const out = await syncOnOpen({ clientId: null, storedAuth, sync: ok });
		expect(out).toEqual({ kind: 'skipped', why: 'no-client-id' });
		expect(storedAuth).not.toHaveBeenCalled();
		expect(ok).not.toHaveBeenCalled();
	});

	// Opening the app offline is ordinary, not a failure.
	it('does nothing offline', async () => {
		const out = await syncOnOpen({ clientId: 'cid', online: false, sync: ok });
		expect(out).toEqual({ kind: 'skipped', why: 'offline' });
		expect(ok).not.toHaveBeenCalled();
	});

	it('does nothing when Drive was never connected', async () => {
		const out = await syncOnOpen({
			clientId: 'cid',
			online: true,
			storedAuth: async () => null,
			sync: ok
		});
		expect(out).toEqual({ kind: 'skipped', why: 'not-connected' });
		expect(ok).not.toHaveBeenCalled();
	});

	it('syncs when connected and online', async () => {
		const out = await syncOnOpen({ clientId: 'cid', online: true, storedAuth: connected, sync: ok });
		expect(out).toEqual({ kind: 'ran', result: { kind: 'merged' } });
		expect(ok).toHaveBeenCalledTimes(1);
	});

	// The regression this guard exists for: GIS refreshes a spent token by
	// opening a popup window, which flashes on screen even when it asks
	// nothing. On launch that window appears for no reason the reader can
	// connect to anything they did.
	it('does not refresh an expired token on open', async () => {
		const out = await syncOnOpen({
			clientId: 'cid',
			online: true,
			storedAuth: async () => ({ expiresAt: Date.now() - 1 }),
			sync: ok
		});
		expect(out).toEqual({ kind: 'skipped', why: 'needs-login' });
		expect(ok).not.toHaveBeenCalled();
	});

	// The margin exists so a sync cannot have its token die mid-flight; a
	// token inside it would be refreshed, so it is not usable unattended.
	it('treats a token inside the refresh margin as needing a login', async () => {
		const out = await syncOnOpen({
			clientId: 'cid',
			online: true,
			storedAuth: async () => ({ expiresAt: Date.now() + 60_000 }),
			sync: ok
		});
		expect(out).toEqual({ kind: 'skipped', why: 'needs-login' });
	});

	// A client-side route change is not a new open. Re-pulling on every
	// navigation would be the per-change sync this deliberately is not.
	it('runs at most once per page load', async () => {
		await syncOnOpen({ clientId: 'cid', online: true, storedAuth: connected, sync: ok });
		const second = await syncOnOpen({ clientId: 'cid', online: true, storedAuth: connected, sync: ok });
		expect(second).toEqual({ kind: 'skipped', why: 'already-ran' });
		expect(ok).toHaveBeenCalledTimes(1);
	});

	// Silent: a launch-time failure the reader did not ask for must not
	// surface, and must not take the app down with it.
	it('swallows a sync that throws', async () => {
		const out = await syncOnOpen({
			clientId: 'cid',
			online: true,
			storedAuth: connected,
			sync: (async () => {
				throw new Error('drive exploded');
			}) as never
		});
		expect(out).toMatchObject({ kind: 'ran', result: { kind: 'error', message: 'drive exploded' } });
	});

	// The gate is what protects an open card; it must actually be handed over.
	it('passes an apply gate to the sync', async () => {
		const sync = vi.fn(async (handlers: { beforeApply?: () => Promise<void> }) => {
			expect(typeof handlers.beforeApply).toBe('function');
			return { kind: 'merged' } as never;
		});
		await syncOnOpen({ clientId: 'cid', online: true, storedAuth: connected, sync: sync as never });
		expect(sync).toHaveBeenCalledTimes(1);
	});
});

describe('cardActivity', () => {
	it('is idle with nothing open', async () => {
		expect(cardActivity.busy).toBe(false);
		await expect(cardActivity.whenIdle()).resolves.toBeUndefined();
	});

	// A list renders many cards and more than one can be open at a time, so a
	// flag would go idle as soon as any single card closed.
	it('waits for the last of several cards', async () => {
		cardActivity.enter();
		cardActivity.enter();
		let settled = false;
		const wait = cardActivity.whenIdle().then(() => (settled = true));

		cardActivity.leave();
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(cardActivity.busy).toBe(true);

		cardActivity.leave();
		await wait;
		expect(settled).toBe(true);
		expect(cardActivity.busy).toBe(false);
	});

	// A card left open on a desk must not hold a sync forever; abandoning is
	// safer than applying a snapshot over someone's recitation.
	it('gives up rather than waiting forever', async () => {
		cardActivity.enter();
		await expect(cardActivity.whenIdle(10)).rejects.toThrow(/still open/);
		cardActivity.leave();
	});

	it('never counts below zero', () => {
		cardActivity.leave();
		cardActivity.leave();
		expect(cardActivity.busy).toBe(false);
	});
});
