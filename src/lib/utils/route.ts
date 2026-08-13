export function currentTab(pathname: string): 'home' | 'library' | 'bookmarks' | 'stats' {
	if (pathname === '/' || pathname === '') return 'home';
	if (pathname.startsWith('/library')) return 'library';
	if (pathname.startsWith('/bookmarks')) return 'bookmarks';
	if (pathname.startsWith('/stats')) return 'stats';
	return 'home';
}

/**
 * Pages that exist to be found rather than used.
 *
 * These are server-rendered into real HTML so a crawler sees text instead of
 * an empty shell, and they get no app chrome: the tab bar is navigation for a
 * tool the reader has not opened yet, and the launch splash would cover the
 * very content the page was written to show.
 */
const CONTENT_PAGES = new Set(['/guide', '/about', '/amsong-day']);

export function isContentPage(pathname: string): boolean {
	return CONTENT_PAGES.has(pathname);
}
