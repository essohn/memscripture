/**
 * "Is there a newer build?", asked by pulling past the foot of the page.
 *
 * There is no service worker here, so nothing can announce a deploy: a tab
 * left open since the last one keeps running the bundle it loaded, and only
 * finds out by asking. The version baked into that bundle is compared against
 * the one the server is publishing now.
 */

/** How far past the end of the page the pull has to travel before it counts.
 *  Short enough to discover by accident, long enough that reaching the bottom
 *  of a long list never triggers it. */
export const PULL_THRESHOLD = 72;

/** Beyond this the indicator stops growing, so a long drag does not stretch
 *  the layout with it. */
const PULL_MAX = 110;

/** Resistance, so the label follows the finger at a fraction of its travel —
 *  the same feel as a native overscroll, and it keeps a determined pull from
 *  running off the screen. */
const FRICTION = 0.45;

/** Whether the page is scrolled to its end, within a pixel of rounding —
 *  fractional device pixel ratios mean the sum rarely lands exactly. */
export function atBottom(scrollY: number, viewportHeight: number, pageHeight: number): boolean {
	return scrollY + viewportHeight >= pageHeight - 1;
}

/** How far to show the indicator pulled, for a finger that has travelled
 *  `dy` px upward past the end of the page. */
export function pullOffset(dy: number): number {
	if (dy <= 0) return 0;
	return Math.min(PULL_MAX, dy * FRICTION);
}

/** Whether releasing now should run the check. Measured on the raw travel
 *  rather than the damped offset, so the threshold means a distance the
 *  finger actually moved. */
export function isArmed(dy: number): boolean {
	return dy >= PULL_THRESHOLD;
}

export type UpdateCheck =
	| { kind: 'current' }
	| { kind: 'outdated'; version: string }
	/** Offline, or the deploy is mid-flight and the file is briefly missing.
	 *  Not worth alarming anyone about — it says so quietly and stays put. */
	| { kind: 'failed' };

/**
 * A build is "newer" when it is simply *different*.
 *
 * Not a semver comparison: the version's meaningful part is the commit SHA,
 * which has no order. Different means the server is serving something other
 * than what this tab is running, and that is exactly the case where reloading
 * helps — including a rollback, where a strict "greater than" would leave the
 * reader stuck on a build that was withdrawn.
 */
export function compareVersions(current: string, latest: string): UpdateCheck {
	const a = current.trim();
	const b = latest.trim();
	if (!b) return { kind: 'failed' };
	return a === b ? { kind: 'current' } : { kind: 'outdated', version: b };
}

/**
 * Asks the server what it is serving now.
 *
 * `cache: 'no-store'` because the whole point is to bypass whatever the
 * browser is holding — a cached answer would report the version this tab
 * already has, forever.
 */
export async function fetchLatestVersion(
	current: string,
	fetchImpl: typeof fetch = fetch
): Promise<UpdateCheck> {
	try {
		const res = await fetchImpl('/version.json', { cache: 'no-store' });
		if (!res.ok) return { kind: 'failed' };
		const body = (await res.json()) as { version?: unknown };
		if (typeof body.version !== 'string') return { kind: 'failed' };
		return compareVersions(current, body.version);
	} catch {
		return { kind: 'failed' };
	}
}
