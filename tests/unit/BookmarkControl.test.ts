import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import BookmarkControl from '../../src/lib/components/srs/BookmarkControl.svelte';

describe('BookmarkControl', () => {
	it('renders "북마크 추가" trigger when no bookmark is set', () => {
		render(BookmarkControl, { props: { current: null, onpick: () => {}, onclear: () => {} } });
		expect(screen.getByRole('button', { name: '북마크 추가' })).toBeInTheDocument();
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('renders colored "리본 (변경)" trigger when a bookmark is set', () => {
		render(BookmarkControl, { props: { current: 'blue', onpick: () => {}, onclear: () => {} } });
		expect(screen.getByRole('button', { name: /파랑 리본 \(변경\)/ })).toBeInTheDocument();
	});

	it('opens a menu popover with 5 color choices on tap', async () => {
		render(BookmarkControl, { props: { current: null, onpick: () => {}, onclear: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: '북마크 추가' }));
		expect(screen.getByRole('menu', { name: '북마크 색상 선택' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '빨강 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '주황 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '초록 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '파랑 리본' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '보라 리본' })).toBeInTheDocument();
	});

	it('picking a new color emits onpick and closes the popover', async () => {
		const onpick = vi.fn();
		render(BookmarkControl, { props: { current: null, onpick, onclear: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: '북마크 추가' }));
		await fireEvent.click(screen.getByRole('button', { name: '초록 리본' }));
		expect(onpick).toHaveBeenCalledWith('green');
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('tapping the current color again emits onclear', async () => {
		const onpick = vi.fn();
		const onclear = vi.fn();
		render(BookmarkControl, { props: { current: 'red', onpick, onclear } });
		await fireEvent.click(screen.getByRole('button', { name: /빨강 리본 \(변경\)/ }));
		await fireEvent.click(screen.getByRole('button', { name: '빨강 리본' }));
		expect(onclear).toHaveBeenCalledTimes(1);
		expect(onpick).not.toHaveBeenCalled();
	});

	it('explicit 지우기 button emits onclear', async () => {
		const onclear = vi.fn();
		render(BookmarkControl, { props: { current: 'amber', onpick: () => {}, onclear } });
		await fireEvent.click(screen.getByRole('button', { name: /주황 리본 \(변경\)/ }));
		await fireEvent.click(screen.getByRole('button', { name: '북마크 지우기' }));
		expect(onclear).toHaveBeenCalledTimes(1);
	});

	it('Esc key closes the popover', async () => {
		render(BookmarkControl, { props: { current: null, onpick: () => {}, onclear: () => {} } });
		await fireEvent.click(screen.getByRole('button', { name: '북마크 추가' }));
		expect(screen.getByRole('menu')).toBeInTheDocument();
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByRole('menu')).toBeNull();
	});
});
