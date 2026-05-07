import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import GroupSubStrip from '../../src/lib/components/filter/GroupSubStrip.svelte';
import type { IndexGroup } from '../../src/lib/types';

const groups: IndexGroup[] = [
	{ package_id: 'p', group_name: '중심되신 그리스도', level: 2, index: [1, 2] },
	{ package_id: 'p', group_name: '말씀', level: 2, index: [3, 4] }
];

describe('GroupSubStrip', () => {
	it('does not render when no groups', () => {
		const { container } = render(GroupSubStrip, {
			props: { groups: [], activeIndices: [], onToggle: () => {} }
		});
		expect(container.textContent?.trim()).toBe('');
	});

	it('renders SUB label and group chips', () => {
		render(GroupSubStrip, { props: { groups, activeIndices: [], onToggle: () => {} } });
		expect(screen.getByText('SUB')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '중심되신 그리스도' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '말씀' })).toBeInTheDocument();
	});

	it('marks active chips via aria-pressed', () => {
		render(GroupSubStrip, {
			props: { groups, activeIndices: [0], onToggle: () => {} }
		});
		expect(screen.getByRole('button', { name: '중심되신 그리스도' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: '말씀' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('calls onToggle with the index when chip clicked', async () => {
		const onToggle = vi.fn();
		render(GroupSubStrip, { props: { groups, activeIndices: [], onToggle } });
		await fireEvent.click(screen.getByRole('button', { name: '말씀' }));
		expect(onToggle).toHaveBeenCalledWith(1);
	});
});
