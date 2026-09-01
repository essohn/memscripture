/**
 * Whether an import performed *here* will be visible where the reader reads.
 *
 * MemScripture stores everything in the device's IndexedDB, and the same
 * origin does not guarantee the same store. iOS gives every web app added to
 * the home screen its own WebKit storage container, walled off from Safari and
 * from every other home-screen app. So a reader who keeps MemScripture on
 * their home screen and follows an import link from somewhere else — a Safari
 * tab, or the in-app window that another installed web app pushes an
 * out-of-scope link into — lands on the right origin, in the right database
 * name, in the wrong container. The verses save, and the app they use never
 * shows them.
 *
 * Nothing in the link can fix that: no fragment, query string, or redirect
 * changes which container the destination runs in, and a web app on iOS cannot
 * claim its own URLs the way a native app claims a universal link. What it can
 * do is notice, say so, and offer the clipboard — which is system-wide and
 * crosses every container.
 *
 * Android is deliberately excluded. There an installed PWA shares the browser
 * profile's storage for its origin, so the direct link already works and a
 * warning would be noise on the platform that does not need it.
 */

export interface BrowsingContext {
	userAgent: string;
	/** navigator.maxTouchPoints */
	maxTouchPoints: number;
	/** matchMedia('(display-mode: standalone)').matches */
	displayStandalone: boolean;
}

/** iPadOS 13 and later report the desktop Mac user agent, so the string alone
 *  cannot tell an iPad from a Mac. Touch points can: Macs report 0. */
function isAppleHandheld(ctx: BrowsingContext): boolean {
	if (/iPhone|iPad|iPod/.test(ctx.userAgent)) return true;
	return /Macintosh/.test(ctx.userAgent) && ctx.maxTouchPoints > 1;
}

/**
 * True when a save here might land outside the container the reader's
 * installed copy reads from.
 *
 * "Might", not "will" — the app cannot see whether a home-screen copy exists,
 * and asking iOS is not possible. So this errs toward telling an iOS reader in
 * a browser what is at stake, and stays silent everywhere the question does
 * not arise. Being wrong costs a banner; staying silent costs the verses.
 */
export function mayNotReachInstalledApp(ctx: BrowsingContext): boolean {
	return isAppleHandheld(ctx) && !ctx.displayStandalone;
}

/**
 * Reads the current context from the browser.
 *
 * Guarded on both sides: `window` is absent when SvelteKit prerenders, and
 * `matchMedia` is absent in some engines and in jsdom. Either way the honest
 * answer is "not standalone" — a page that cannot tell is a page that should
 * not claim the reader is already inside their installed app.
 */
export function readBrowsingContext(): BrowsingContext {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return { userAgent: '', maxTouchPoints: 0, displayStandalone: false };
	}
	return {
		userAgent: navigator.userAgent,
		maxTouchPoints: navigator.maxTouchPoints ?? 0,
		displayStandalone: window.matchMedia
			? window.matchMedia('(display-mode: standalone)').matches
			: false
	};
}
