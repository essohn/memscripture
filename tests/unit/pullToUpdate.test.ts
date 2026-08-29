import { describe, expect, it, vi } from 'vitest';
import {
	atBottom,
	compareVersions,
	fetchLatestVersion,
	isArmed,
	PULL_THRESHOLD,
	pullOffset,
	RECHECK_AFTER_MS,
	shouldRecheck
} from '../../src/lib/update/pullToUpdate';

describe('atBottom', () => {
	it('is true at the end of the page', () => {
		expect(atBottom(1200, 800, 2000)).toBe(true);
	});

	// Fractional device pixel ratios mean the sum rarely lands exactly on the
	// page height, so a strict equality would make the gesture unreachable on
	// most phones.
	it('tolerates a sub-pixel shortfall', () => {
		expect(atBottom(1199.4, 800, 2000)).toBe(true);
	});

	it('is false partway down', () => {
		expect(atBottom(400, 800, 2000)).toBe(false);
	});

	it('is true on a page shorter than the viewport', () => {
		expect(atBottom(0, 800, 600)).toBe(true);
	});
});

describe('pullOffset', () => {
	it('is nothing until the finger moves up', () => {
		expect(pullOffset(0)).toBe(0);
		expect(pullOffset(-40)).toBe(0);
	});

	// Damped, so the label trails the finger the way a native overscroll does.
	it('follows the finger at a fraction of its travel', () => {
		expect(pullOffset(100)).toBeLessThan(100);
		expect(pullOffset(100)).toBeGreaterThan(0);
	});

	it('grows with the pull', () => {
		expect(pullOffset(120)).toBeGreaterThan(pullOffset(60));
	});

	// A determined drag must not stretch the footer off the screen.
	it('stops growing past its cap', () => {
		expect(pullOffset(10_000)).toBe(pullOffset(5_000));
	});
});

describe('isArmed', () => {
	// Measured on raw travel, not the damped offset, so the threshold means a
	// distance the finger actually moved.
	it('arms at the threshold and not before', () => {
		expect(isArmed(PULL_THRESHOLD - 1)).toBe(false);
		expect(isArmed(PULL_THRESHOLD)).toBe(true);
	});
});

describe('compareVersions', () => {
	it('says nothing to do when the versions match', () => {
		expect(compareVersions('0.1.5+abc', '0.1.5+abc')).toEqual({ kind: 'current' });
	});

	it('ignores surrounding whitespace', () => {
		expect(compareVersions('0.1.5+abc', ' 0.1.5+abc\n')).toEqual({ kind: 'current' });
	});

	// The meaningful part of the version is a commit SHA, which has no order.
	// "Different" is the right test — and it covers a rollback, where a strict
	// "greater than" would strand the reader on a build that was withdrawn.
	it('treats any difference as something to load, including going back', () => {
		expect(compareVersions('0.1.9+newer', '0.1.2+older')).toEqual({
			kind: 'outdated',
			version: '0.1.2+older'
		});
	});

	it('reports a blank answer as a failure rather than a match', () => {
		expect(compareVersions('0.1.5+abc', '   ')).toEqual({ kind: 'failed' });
	});
});

describe('fetchLatestVersion', () => {
	const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

	it('compares against what the server publishes', async () => {
		const f = vi.fn().mockResolvedValue(ok({ version: '9.9.9+zzz' }));
		await expect(fetchLatestVersion('0.1.5+abc', f as never)).resolves.toEqual({
			kind: 'outdated',
			version: '9.9.9+zzz'
		});
	});

	// A cached answer would report the version this tab already has, forever.
	it('bypasses the browser cache', async () => {
		const f = vi.fn().mockResolvedValue(ok({ version: '0.1.5+abc' }));
		await fetchLatestVersion('0.1.5+abc', f as never);
		expect(f).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
	});

	// Offline, or a deploy mid-flight with the file briefly missing. Neither is
	// worth alarming anyone about, and neither may look like "up to date".
	it.each([
		['a network error', () => Promise.reject(new Error('offline'))],
		['a non-OK response', () => Promise.resolve({ ok: false } as Response)],
		['a body without a version', () => Promise.resolve(ok({}))],
		['a version that is not a string', () => Promise.resolve(ok({ version: 7 }))],
		['a body that is not JSON', () => Promise.resolve({ ok: true, json: async () => { throw new Error('bad'); } } as unknown as Response)]
	])('reports failure on %s', async (_label, impl) => {
		await expect(fetchLatestVersion('0.1.5+abc', impl as never)).resolves.toEqual({
			kind: 'failed'
		});
	});
});

describe('shouldRecheck', () => {
	it('always asks the first time', () => {
		expect(shouldRecheck(null, 0)).toBe(true);
	});

	// The trigger is a tab coming back to the foreground, which fires every
	// time the reader switches apps.
	it('does not ask again straight away', () => {
		expect(shouldRecheck(1_000, 1_000 + RECHECK_AFTER_MS - 1)).toBe(false);
	});

	it('asks again once the interval is up', () => {
		expect(shouldRecheck(1_000, 1_000 + RECHECK_AFTER_MS)).toBe(true);
	});

	// A device whose clock moved backwards would otherwise stop asking until
	// the clock caught up, which on a tablet left overnight can be hours.
	it('asks when the clock has gone backwards', () => {
		expect(shouldRecheck(10_000, 5_000)).toBe(true);
	});
});
