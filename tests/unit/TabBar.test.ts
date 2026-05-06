import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import TabBar from '../../src/lib/components/nav/TabBar.svelte';

describe('TabBar', () => {
	it('renders three tabs', () => {
		render(TabBar, { props: { current: 'today' } });
		expect(screen.getByRole('link', { name: /today/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /stats/i })).toBeInTheDocument();
	});

	it('marks current tab as active via aria-current', () => {
		render(TabBar, { props: { current: 'library' } });
		const lib = screen.getByRole('link', { name: /library/i });
		expect(lib).toHaveAttribute('aria-current', 'page');
	});
});
