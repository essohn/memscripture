import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import PlaylistBar from '../../src/lib/components/player/PlaylistBar.svelte';

const props = {
	playing: true,
	label: '창세기 28:14',
	index: 2,
	count: 12,
	fraction: 0.2,
	elapsedMs: 72_000,
	totalMs: 400_000,
	repeat: true,
	onToggle: () => {},
	onSeek: () => {},
	onToggleRepeat: () => {},
	onClose: () => {}
};

describe('PlaylistBar', () => {
	it('names the verse being read and its place in the list', () => {
		render(PlaylistBar, { props });
		expect(screen.getByText('창세기 28:14')).toBeInTheDocument();
		expect(screen.getByText('2/12')).toBeInTheDocument();
	});

	it('shows elapsed and total time', () => {
		render(PlaylistBar, { props });
		expect(screen.getByText('1:12 / 6:40')).toBeInTheDocument();
	});

	// The tap has to promise what it does: pause while playing, play while not.
	it('the transport button follows the playing state', () => {
		const { unmount } = render(PlaylistBar, { props });
		expect(screen.getByRole('button', { name: '일시정지' })).toBeInTheDocument();
		unmount();
		render(PlaylistBar, { props: { ...props, playing: false } });
		expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
	});

	it('the repeat toggle reports whether it is armed', () => {
		const { unmount } = render(PlaylistBar, { props });
		expect(screen.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		unmount();
		render(PlaylistBar, { props: { ...props, repeat: false } });
		expect(screen.getByRole('button', { name: '목록 반복' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	it('calls back on toggle, repeat and close', async () => {
		const onToggle = vi.fn();
		const onToggleRepeat = vi.fn();
		const onClose = vi.fn();
		render(PlaylistBar, { props: { ...props, onToggle, onToggleRepeat, onClose } });
		await fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
		await fireEvent.click(screen.getByRole('button', { name: '목록 반복' }));
		await fireEvent.click(screen.getByRole('button', { name: '재생 닫기' }));
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onToggleRepeat).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

describe('PlaylistBar when the device will not speak', () => {
	// A bar that simply stopped, with no sound and no word, is what sent an
	// Android reader to the developer instead of to 설정. The message names the
	// one thing that fixes it.
	it('says so, and points at the voice setting', () => {
		render(PlaylistBar, { props: { ...props, failed: true } });
		expect(screen.getByRole('status')).toHaveTextContent(/음성/);
	});

	it('stays out of the way while playback is fine', () => {
		render(PlaylistBar, { props });
		expect(screen.queryByRole('status')).toBeNull();
	});
});
