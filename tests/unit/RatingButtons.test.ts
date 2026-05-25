import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import RatingButtons from '../../src/lib/components/srs/RatingButtons.svelte';

describe('RatingButtons (cite phase)', () => {
	it('renders the cite prompt and 4 labels', () => {
		render(RatingButtons, { props: { phase: 'cite', onrate: () => {} } });
		expect(screen.getByText('시작 부분을 떠올리는데 느꼈던 난이도')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '떠오르지 않음' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '느리게 떠오름' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '적절히 떠오름' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '빨리 떠오름' })).toBeInTheDocument();
	});

	it.each([
		{ label: '떠오르지 않음', expected: 1 },
		{ label: '느리게 떠오름', expected: 2 },
		{ label: '적절히 떠오름', expected: 3 },
		{ label: '빨리 떠오름', expected: 4 }
	])('emits $expected for $label', async ({ label, expected }) => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { phase: 'cite', onrate } });
		await fireEvent.click(screen.getByRole('button', { name: label }));
		expect(onrate).toHaveBeenCalledWith(expected);
	});
});

describe('RatingButtons (recall phase)', () => {
	it('renders the recall prompt and 4 labels', () => {
		render(RatingButtons, { props: { phase: 'recall', onrate: () => {} } });
		expect(screen.getByText('암송 구절 전체가 일치했던 정도')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '많이 틀림' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '조금 틀림' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '맞지만 불안함' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '완벽히 일치함' })).toBeInTheDocument();
	});

	it.each([
		{ label: '많이 틀림', expected: 1 },
		{ label: '조금 틀림', expected: 2 },
		{ label: '맞지만 불안함', expected: 3 },
		{ label: '완벽히 일치함', expected: 4 }
	])('emits $expected for $label', async ({ label, expected }) => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { phase: 'recall', onrate } });
		await fireEvent.click(screen.getByRole('button', { name: label }));
		expect(onrate).toHaveBeenCalledWith(expected);
	});
});
