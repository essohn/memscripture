import { describe, it, expect, beforeEach } from 'vitest';
import { RecentList, RECENT_LIST_KEY } from '../../src/lib/state/recentList.svelte';

describe('RecentList', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('has nothing to offer before a list has been opened', () => {
		expect(new RecentList().href).toBeNull();
	});

	it('remembers the list that was opened', () => {
		const recent = new RecentList();
		recent.remember('/stats/verses?event=e1&dim=start&level=4');
		expect(recent.href).toBe('/stats/verses?event=e1&dim=start&level=4');
	});

	it('keeps only the latest list', () => {
		const recent = new RecentList();
		recent.remember('/stats/verses?event=e1&dim=start&level=4');
		recent.remember('/library/60_krv?range=1,2,3&g=0');
		expect(recent.href).toBe('/library/60_krv?range=1,2,3&g=0');
	});

	// The whole point of the tab: it survives closing the app, not just a
	// client-side route change.
	it('survives a reload', () => {
		new RecentList().remember('/bookmarks');
		expect(new RecentList().href).toBe('/bookmarks');
	});

	it('forgets a list whose target is gone', () => {
		const recent = new RecentList();
		recent.remember('/stats/verses?event=deleted&dim=full&level=2');
		recent.forget();
		expect(recent.href).toBeNull();
		expect(new RecentList().href).toBeNull();
	});

	/*
	 * The list page reports a dead target from its own effect, while the layout
	 * records the same URL from its effect, on the same navigation. Rather than
	 * depend on which effect Svelte flushes first, a forgotten URL refuses to be
	 * recorded again for the rest of the session — so Recent ends up dim either
	 * way round.
	 */
	it('refuses to record a list it was just told is gone', () => {
		const recent = new RecentList();
		const dead = '/stats/verses?event=deleted&dim=full&level=2';
		recent.forget(dead);
		recent.remember(dead);
		expect(recent.href).toBeNull();
	});

	it('still records other lists after one is forgotten', () => {
		const recent = new RecentList();
		recent.forget('/stats/verses?event=deleted&dim=full&level=2');
		recent.remember('/bookmarks');
		expect(recent.href).toBe('/bookmarks');
	});

	// Session-scoped, not persisted: reinstall the package the event points at
	// and a reload should be able to reach the list again.
	it('lets a reload revive a list forgotten in an earlier session', () => {
		const dead = '/stats/verses?event=reinstalled&dim=full&level=2';
		new RecentList().forget(dead);
		const afterReload = new RecentList();
		afterReload.remember(dead);
		expect(afterReload.href).toBe(dead);
	});

	// A stored value from a hand-edited devtools session, or a future build that
	// wrote something else under this key, must not become an href the bar will
	// navigate to.
	it('ignores a stored value that is not an app path', () => {
		localStorage.setItem(RECENT_LIST_KEY, 'https://example.com/phish');
		expect(new RecentList().href).toBeNull();
	});

	it('ignores a protocol-relative stored value', () => {
		localStorage.setItem(RECENT_LIST_KEY, '//example.com/phish');
		expect(new RecentList().href).toBeNull();
	});

	it('ignores an empty stored value', () => {
		localStorage.setItem(RECENT_LIST_KEY, '');
		expect(new RecentList().href).toBeNull();
	});

	// Private mode and "block site data" both throw on access rather than
	// returning null. A tab bar must render either way.
	it('stays usable when storage refuses to answer', () => {
		const original = Storage.prototype.getItem;
		Storage.prototype.getItem = () => {
			throw new Error('SecurityError');
		};
		try {
			expect(new RecentList().href).toBeNull();
		} finally {
			Storage.prototype.getItem = original;
		}
	});

	it('stays usable when storage refuses to write', () => {
		const original = Storage.prototype.setItem;
		Storage.prototype.setItem = () => {
			throw new Error('QuotaExceededError');
		};
		try {
			const recent = new RecentList();
			expect(() => recent.remember('/bookmarks')).not.toThrow();
			// The tab still works for this session even though nothing persisted.
			expect(recent.href).toBe('/bookmarks');
		} finally {
			Storage.prototype.setItem = original;
		}
	});
});
