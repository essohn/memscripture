export function currentTab(pathname: string): 'today' | 'library' | 'bookmarks' | 'stats' {
	if (pathname.startsWith('/library')) return 'library';
	if (pathname.startsWith('/bookmarks')) return 'bookmarks';
	if (pathname.startsWith('/stats')) return 'stats';
	return 'today';
}
