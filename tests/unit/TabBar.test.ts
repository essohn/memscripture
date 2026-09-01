import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import TabBar from '../../src/lib/components/nav/TabBar.svelte';

const withRecent = { current: 'home' as const, recentHref: '/stats/verses?event=e1&dim=start&level=4' };

describe('TabBar', () => {
	it('renders four tabs (Home / Last Read / Library / Marks)', () => {
		render(TabBar, { props: withRecent });
		expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /last read/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /marks/i })).toBeInTheDocument();
	});

	// Stats was a "Phase 6에서 추가됩니다" stub. Today tab remains absent too.
	it('offers no tab for screens that do nothing yet', () => {
		render(TabBar, { props: withRecent });
		expect(screen.queryByRole('link', { name: /stats/i })).toBeNull();
		expect(screen.queryByRole('link', { name: /today/i })).toBeNull();
	});

	it('puts Last Read directly after Home', () => {
		render(TabBar, { props: withRecent });
		const labels = screen.getAllByRole('listitem').map((li) => li.textContent?.trim());
		expect(labels).toEqual(['Home', 'Last Read', 'Library', 'Marks']);
	});

	it('points Last Read at the remembered list', () => {
		render(TabBar, { props: withRecent });
		expect(screen.getByRole('link', { name: /last read/i })).toHaveAttribute(
			'href',
			'/stats/verses?event=e1&dim=start&level=4'
		);
	});

	// Nothing remembered yet: a control that cannot go anywhere should not be
	// offered as one. A link with no href would still be announced as a link.
	it('offers no link when there is no remembered list', () => {
		render(TabBar, { props: { current: 'home', recentHref: null } });
		expect(screen.queryByRole('link', { name: /last read/i })).toBeNull();
		expect(screen.getByText('Last Read')).toBeInTheDocument();
	});

	it('marks the dimmed Last Read tab as disabled', () => {
		render(TabBar, { props: { current: 'home', recentHref: null } });
		const item = screen.getAllByRole('listitem').find((li) => li.textContent?.trim() === 'Last Read');
		expect(item).toBeDefined();
		expect(item!.querySelector('[aria-disabled="true"]')).not.toBeNull();
	});

	it('marks Home tab as active when current=home', () => {
		render(TabBar, { props: withRecent });
		expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page');
	});

	it('marks current tab as active via aria-current', () => {
		render(TabBar, { props: { ...withRecent, current: 'library' } });
		expect(screen.getByRole('link', { name: /library/i })).toHaveAttribute('aria-current', 'page');
	});

	it('marks bookmarks tab as active when current=bookmarks', () => {
		render(TabBar, { props: { ...withRecent, current: 'bookmarks' } });
		expect(screen.getByRole('link', { name: /marks/i })).toHaveAttribute('aria-current', 'page');
	});

	// The tab's id stays `recent` — it is internal, and the route helpers are
	// keyed on it. Only what the reader sees changed.
	it('marks the Last Read tab as active when current=recent', () => {
		render(TabBar, { props: { ...withRecent, current: 'recent' } });
		expect(screen.getByRole('link', { name: /last read/i })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});
});
