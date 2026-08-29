export type Tab = 'home' | 'recent' | 'library' | 'bookmarks';

/**
 * Which tab the bar highlights for a path.
 *
 * Section tabs win wherever one exists: a package's verses light Library and
 * the bookmarks list lights Marks, even when either of them is also the list
 * Recent remembers. Recent is a shortcut, not a section — it only claims the
 * difficulty lists under /stats, which no other tab owns.
 */
export function currentTab(pathname: string): Tab {
	if (pathname === '/' || pathname === '') return 'home';
	if (pathname.startsWith('/library')) return 'library';
	if (pathname.startsWith('/bookmarks')) return 'bookmarks';
	if (pathname.startsWith('/stats')) return 'recent';
	return 'home';
}

/**
 * Whether a path is a list of verses worth coming back to.
 *
 * The Recent tab stores one URL and nothing else, which works only because
 * every list screen carries its whole question in the URL: /stats/verses holds
 * the event, dimension and bucket; /library/{pkg} holds the range and group
 * filter. Re-opening one re-asks the question rather than replaying a stale
 * answer.
 *
 * What counts, and what does not:
 *  - /stats/verses — a difficulty or 완벽 bucket from the home chart.
 *  - /library/{packageId} — a package's verses, including the range cards that
 *    arrive with ?range=&s=&g=, and /library/oyo.
 *  - /bookmarks — already its own tab, but it is a list of verses, and Recent
 *    answers "the last one I was on" rather than "the one Marks does not
 *    cover".
 *  - /library is the index of packages, not of verses; /library/{id}/{no} is a
 *    single verse; /search keeps its query in component state rather than the
 *    URL, so a remembered one would reopen an empty box.
 */
export function isVerseList(pathname: string): boolean {
	// SvelteKit normalizes the trailing slash away before this is called, but
	// the predicate decides what gets stored, and a near-miss here would show up
	// only as Recent quietly never updating.
	const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	if (path === '/stats/verses' || path === '/bookmarks') return true;
	return /^\/library\/[^/]+$/.test(path);
}

/**
 * Pages that exist to be found rather than used.
 *
 * These are server-rendered into real HTML so a crawler sees text instead of
 * an empty shell, and they get no app chrome: the tab bar is navigation for a
 * tool the reader has not opened yet, and the launch splash would cover the
 * very content the page was written to show.
 */
/** Empty while the landing pages are held back — see drafts/pages/README.md. */
const CONTENT_PAGES = new Set<string>();

export function isContentPage(pathname: string): boolean {
	return CONTENT_PAGES.has(pathname);
}
