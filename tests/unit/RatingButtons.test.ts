import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import RatingButtons from '../../src/lib/components/srs/RatingButtons.svelte';

describe('RatingButtons', () => {
	it('renders all 4 buttons with Korean labels', () => {
		render(RatingButtons, { props: { onrate: () => {} } });
		expect(screen.getByRole('button', { name: '다시' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '어렵' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '좋음' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '쉬움' })).toBeInTheDocument();
	});

	it('emits 1 for 다시', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '다시' }));
		expect(onrate).toHaveBeenCalledWith(1);
	});

	it('emits 2 for 어렵', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '어렵' }));
		expect(onrate).toHaveBeenCalledWith(2);
	});

	it('emits 3 for 좋음', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '좋음' }));
		expect(onrate).toHaveBeenCalledWith(3);
	});

	it('emits 4 for 쉬움', async () => {
		const onrate = vi.fn();
		render(RatingButtons, { props: { onrate } });
		await fireEvent.click(screen.getByRole('button', { name: '쉬움' }));
		expect(onrate).toHaveBeenCalledWith(4);
	});
});
