import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import SeriesSubTabStrip from '../../src/lib/components/filter/SeriesSubTabStrip.svelte';
import type { IndexGroup } from '../../src/lib/types';

const series2: IndexGroup[] = [
	{ package_id: 'p', group_name: 'A', level: 1, index: [1, 2] },
	{ package_id: 'p', group_name: 'B', level: 1, index: [3, 4] }
];

describe('SeriesSubTabStrip', () => {
	it('does not render when only one series', () => {
		const single: IndexGroup[] = [{ package_id: 'p', group_name: 'X', level: 1, index: [1] }];
		const { container } = render(SeriesSubTabStrip, {
			props: { series: single, activeIndex: null, onSelect: () => {} }
		});
		expect(container.textContent?.trim()).toBe('');
	});

	it('renders 전체 chip first then series chips', () => {
		render(SeriesSubTabStrip, {
			props: { series: series2, activeIndex: null, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
	});

	it('marks active chip via aria-pressed', () => {
		render(SeriesSubTabStrip, {
			props: { series: series2, activeIndex: 0, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('marks 전체 active when activeIndex is null', () => {
		render(SeriesSubTabStrip, {
			props: { series: series2, activeIndex: null, onSelect: () => {} }
		});
		expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('calls onSelect with index when chip clicked', async () => {
		const onSelect = vi.fn();
		render(SeriesSubTabStrip, { props: { series: series2, activeIndex: null, onSelect } });
		await fireEvent.click(screen.getByRole('button', { name: 'B' }));
		expect(onSelect).toHaveBeenCalledWith(1);
	});

	it('calls onSelect with null when 전체 clicked', async () => {
		const onSelect = vi.fn();
		render(SeriesSubTabStrip, { props: { series: series2, activeIndex: 0, onSelect } });
		await fireEvent.click(screen.getByRole('button', { name: '전체' }));
		expect(onSelect).toHaveBeenCalledWith(null);
	});
});
