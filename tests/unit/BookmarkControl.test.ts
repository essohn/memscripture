import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import BookmarkControl from '../../src/lib/components/srs/BookmarkControl.svelte';

describe('BookmarkControl', () => {
	it('collapsed state with no bookmark shows "북마크" affordance', () => {
		render(BookmarkControl, {
			props: { current: null, onpick: () => {}, onclear: () => {} }
		});
		expect(screen.getByRole('button', { name: '북마크' })).toBeInTheDocument();
	});

	it('collapsed state with bookmark shows that color label', () => {
		render(BookmarkControl, {
			props: { current: 'blue', onpick: () => {}, onclear: () => {} }
		});
		expect(screen.getByRole('button', { name: '파랑 리본' })).toBeInTheDocument();
	});

	it('expanding reveals 5 color picker buttons', async () => {
		render(BookmarkControl, {
			props: { current: null, onpick: () => {}, onclear: () => {} }
		});
		await fireEvent.click(screen.getByRole('button', { name: '북마크' }));
		expect(screen.getByRole('button', { name: '빨강 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '주황 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '초록 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '파랑 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '보라 리본' })).toBeInTheDocument();
	});

	it('picking a new color emits onpick with that color and collapses', async () => {
		const onpick = vi.fn();
		render(BookmarkControl, {
			props: { current: null, onpick, onclear: () => {} }
		});
		await fireEvent.click(screen.getByRole('button', { name: '북마크' }));
		await fireEvent.click(screen.getByRole('button', { name: '초록 리본' }));
		expect(onpick).toHaveBeenCalledWith('green');
		// collapsed back: only the affordance button is visible
		expect(screen.getByRole('button', { name: '북마크' })).toBeInTheDocument();
	});

	it('tapping the current color again emits onclear', async () => {
		const onpick = vi.fn();
		const onclear = vi.fn();
		render(BookmarkControl, {
			props: { current: 'red', onpick, onclear }
		});
		// Collapsed button has name "빨강 리본"; clicking expands.
		await fireEvent.click(screen.getByRole('button', { name: '빨강 리본' }));
		// After expanding, the picker shows the 빨강 리본 color button (with same a11y name) — tap it.
		await fireEvent.click(screen.getByRole('button', { name: '빨강 리본' }));
		expect(onclear).toHaveBeenCalledTimes(1);
		expect(onpick).not.toHaveBeenCalled();
	});

	it('explicit 지우기 button emits onclear', async () => {
		const onclear = vi.fn();
		render(BookmarkControl, {
			props: { current: 'amber', onpick: () => {}, onclear }
		});
		await fireEvent.click(screen.getByRole('button', { name: '주황 리본' })); // expand
		await fireEvent.click(screen.getByRole('button', { name: '북마크 지우기' }));
		expect(onclear).toHaveBeenCalledTimes(1);
	});
});
