import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import CategoryTag from '../../src/lib/components/filter/CategoryTag.svelte';

describe('CategoryTag', () => {
	it('renders the label for level-1 with gold styling', () => {
		render(CategoryTag, { props: { label: 'A. 새로운 삶', level: 1 } });
		const el = screen.getByText('A. 새로운 삶');
		expect(el).toBeInTheDocument();
	});

	it('renders the label for level-2', () => {
		render(CategoryTag, { props: { label: '중심되신 그리스도', level: 2 } });
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
	});

	it('emits click when interactive (default)', async () => {
		const onclick = vi.fn();
		render(CategoryTag, { props: { label: 'A', level: 1, onclick } });
		await fireEvent.click(screen.getByRole('button', { name: 'A' }));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('renders as static span when interactive=false (no role=button)', () => {
		render(CategoryTag, { props: { label: 'A', level: 1, interactive: false } });
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText('A')).toBeInTheDocument();
	});

	it('reflects active state via aria-pressed', () => {
		render(CategoryTag, { props: { label: 'A', level: 1, active: true } });
		const btn = screen.getByRole('button', { name: 'A' });
		expect(btn).toHaveAttribute('aria-pressed', 'true');
	});
});
