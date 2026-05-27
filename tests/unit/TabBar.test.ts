import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import TabBar from '../../src/lib/components/nav/TabBar.svelte';

describe('TabBar', () => {
	it('renders three tabs (Today disabled)', () => {
		render(TabBar, { props: { current: 'library' } });
		expect(screen.queryByRole('link', { name: /today/i })).toBeNull();
		expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /marks/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /stats/i })).toBeInTheDocument();
	});

	it('marks current tab as active via aria-current', () => {
		render(TabBar, { props: { current: 'library' } });
		const lib = screen.getByRole('link', { name: /library/i });
		expect(lib).toHaveAttribute('aria-current', 'page');
	});

	it('marks bookmarks tab as active when current=bookmarks', () => {
		render(TabBar, { props: { current: 'bookmarks' } });
		const marks = screen.getByRole('link', { name: /marks/i });
		expect(marks).toHaveAttribute('aria-current', 'page');
	});
});
