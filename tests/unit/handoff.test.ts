import { describe, expect, it } from 'vitest';
import {
	mayNotReachInstalledApp,
	readBrowsingContext,
	type BrowsingContext
} from '../../src/lib/oyo/handoff';

/** The contexts a reader actually arrives in, written out once so each test
 *  names the difference it cares about rather than a wall of fields. */
const IPHONE_SAFARI: BrowsingContext = {
	userAgent:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	maxTouchPoints: 5,
	displayStandalone: false
};

const IPAD_SAFARI: BrowsingContext = {
	// iPadOS reports a desktop Mac UA; only maxTouchPoints gives it away.
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	maxTouchPoints: 5,
	displayStandalone: false
};

const ANDROID_CHROME: BrowsingContext = {
	userAgent:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
	maxTouchPoints: 5,
	displayStandalone: false
};

const MAC_SAFARI: BrowsingContext = {
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	maxTouchPoints: 0,
	displayStandalone: false
};

describe('mayNotReachInstalledApp', () => {
	// The whole reason this module exists: iOS gives every home-screen web app
	// its own storage container, so a verse saved in Safari is invisible to the
	// installed copy even though the origin and the database name match.
	it('warns in an iPhone browser tab, where the installed app cannot see the write', () => {
		expect(mayNotReachInstalledApp(IPHONE_SAFARI)).toBe(true);
	});

	it('warns on an iPad, which hides behind a desktop user agent', () => {
		expect(mayNotReachInstalledApp(IPAD_SAFARI)).toBe(true);
	});

	// Already inside the container the verses will be read from. Warning here
	// would be telling the reader their own app is the wrong app.
	it('stays quiet inside the installed app', () => {
		expect(mayNotReachInstalledApp({ ...IPHONE_SAFARI, displayStandalone: true })).toBe(false);
	});

	// Android's installed PWA shares Chrome's storage for the origin, so the
	// direct link works and a warning would be noise.
	it('stays quiet on Android, where a tab and the installed app share storage', () => {
		expect(mayNotReachInstalledApp(ANDROID_CHROME)).toBe(false);
	});

	it('stays quiet on a desktop Mac, which has no home-screen web apps', () => {
		expect(mayNotReachInstalledApp(MAC_SAFARI)).toBe(false);
	});
});

describe('readBrowsingContext', () => {
	it('reads the live user agent', () => {
		expect(readBrowsingContext().userAgent).toBe(navigator.userAgent);
	});

	// jsdom ships no matchMedia, and neither does every real engine this app
	// runs in. Reaching for it unguarded would throw inside the import screen's
	// first effect and blank the page the reader came to use.
	it('reports not-standalone rather than throwing when matchMedia is absent', () => {
		expect(window.matchMedia).toBeUndefined();
		expect(readBrowsingContext().displayStandalone).toBe(false);
	});
});
