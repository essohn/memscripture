export function currentTab(pathname: string): 'home' | 'library' | 'bookmarks' | 'stats' {
	if (pathname === '/' || pathname === '') return 'home';
	if (pathname.startsWith('/library')) return 'library';
	if (pathname.startsWith('/bookmarks')) return 'bookmarks';
	if (pathname.startsWith('/stats')) return 'stats';
	return 'home';
}
