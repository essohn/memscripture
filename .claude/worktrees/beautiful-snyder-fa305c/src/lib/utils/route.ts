export function currentTab(pathname: string): 'today' | 'library' | 'stats' {
	if (pathname.startsWith('/library')) return 'library';
	if (pathname.startsWith('/stats')) return 'stats';
	return 'today';
}
