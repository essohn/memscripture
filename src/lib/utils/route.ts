export function currentTab(pathname: string): 'library' | 'bookmarks' | 'stats' {
	if (pathname.startsWith('/bookmarks')) return 'bookmarks';
	if (pathname.startsWith('/stats')) return 'stats';
	return 'library';
}
